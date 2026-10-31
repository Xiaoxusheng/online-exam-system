package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/store"
)

const (
	wsPongWait       = 75 * time.Second
	wsPingPeriod     = 60 * time.Second
	wsWriteWait      = 10 * time.Second
	wsSendBuffer     = 32
	wsReadLimit      = 512
	wsMaxRoomClients = 64
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	// The handler validates the Origin header against the CORS allow-list itself
	// so that a rejection can answer with the standard JSON error envelope.
	CheckOrigin: func(*http.Request) bool { return true },
}

type proctorClient struct {
	conn   *websocket.Conn
	examID string
	userID string
	send   chan []byte
	mu     sync.Mutex
	closed bool
	once   sync.Once
}

// push queues a frame for the writer goroutine. It never blocks and reports false
// when the client is gone or cannot keep up, so the caller can drop it.
func (c *proctorClient) push(payload []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return false
	}
	select {
	case c.send <- payload:
		return true
	default:
		return false
	}
}

func (c *proctorClient) shutdown() {
	c.once.Do(func() {
		c.mu.Lock()
		c.closed = true
		close(c.send)
		c.mu.Unlock()
	})
}

// proctorHub keeps one broadcast room per exam and implements store.RealtimePublisher.
type proctorHub struct {
	mu    sync.RWMutex
	rooms map[string]map[*proctorClient]struct{}
	log   *slog.Logger
}

func newProctorHub(log *slog.Logger) *proctorHub {
	return &proctorHub{rooms: make(map[string]map[*proctorClient]struct{}), log: log}
}

// PublishRealtime is the entry point used by the store after a committed change.
func (h *proctorHub) PublishRealtime(event store.RealtimeEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		h.log.Warn("marshal realtime event failed", "type", event.Type, "error", err)
		return
	}
	h.broadcast(event.ExamID, payload)
}

func (h *proctorHub) join(client *proctorClient) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[client.examID]
	if room == nil {
		room = make(map[*proctorClient]struct{})
		h.rooms[client.examID] = room
	}
	if len(room) >= wsMaxRoomClients {
		return false
	}
	room[client] = struct{}{}
	return true
}

func (h *proctorHub) leave(client *proctorClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[client.examID]
	if room == nil {
		return
	}
	delete(room, client)
	if len(room) == 0 {
		delete(h.rooms, client.examID)
	}
}

func (h *proctorHub) onlineCount(examID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[examID])
}

func (h *proctorHub) broadcast(examID string, payload []byte) {
	h.mu.RLock()
	room := h.rooms[examID]
	targets := make([]*proctorClient, 0, len(room))
	for client := range room {
		targets = append(targets, client)
	}
	h.mu.RUnlock()

	for _, client := range targets {
		if client.push(payload) {
			continue
		}
		// A stalled consumer must not slow the whole room down.
		h.log.Warn("proctor websocket too slow, closing", "exam_id", examID, "user_id", client.userID)
		h.leave(client)
		client.shutdown()
	}
}

func (a *API) PublishRealtime(event store.RealtimeEvent) {
	a.hub.PublishRealtime(event)
}

type wsInbound struct {
	Type string `json:"type"`
}

// originAllowed mirrors the CORS allow-list for the websocket handshake.
// Non-browser clients (health probes, tests) send no Origin and are accepted.
func (a *API) originAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	for _, allowed := range a.cfg.CORSOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (a *API) handleProctorWebSocket(w http.ResponseWriter, r *http.Request) {
	examID, ok := parseUUIDParam(w, pathParam(r, "examId"), "考试 ID")
	if !ok {
		return
	}
	if !a.originAllowed(r) {
		apiError(w, http.StatusForbidden, "FORBIDDEN", "跨域来源不被允许")
		return
	}
	raw := strings.TrimSpace(r.URL.Query().Get("token"))
	if raw == "" {
		raw = bearerToken(r)
	}
	claims, err := a.tokens.Parse(raw)
	if err != nil {
		message := "登录状态已失效，请重新登录"
		if errors.Is(err, auth.ErrInvalidToken) {
			message = "登录状态无效，请重新登录"
		}
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", message)
		return
	}
	if !a.canWatchExam(w, r, claims, examID) {
		return
	}
	exam, err := a.store.GetExam(r.Context(), claims.OrgID, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		a.log.Warn("websocket upgrade failed", "error", err, "exam_id", examID)
		return
	}
	client := &proctorClient{conn: conn, examID: examID, userID: claims.Subject, send: make(chan []byte, wsSendBuffer)}
	if !a.hub.join(client) {
		a.log.Warn("proctor room full", "exam_id", examID, "user_id", claims.Subject)
		_ = conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "监考房间连接数已达上限"),
			time.Now().Add(wsWriteWait))
		_ = conn.Close()
		return
	}
	a.log.Info("proctor websocket connected",
		"exam_id", examID, "exam_title", exam.Title, "user_id", claims.Subject, "role", claims.Role)

	hello, err := json.Marshal(map[string]any{
		"type": "connected",
		"data": map[string]any{
			"exam_id":     exam.ID,
			"exam_title":  exam.Title,
			"exam_status": exam.Status,
			"online":      a.hub.onlineCount(examID),
			"server_time": time.Now(),
		},
	})
	if err == nil {
		client.push(hello)
	}

	go a.wsWritePump(client)
	a.wsReadPump(client, examID)
}

func (a *API) wsWritePump(client *proctorClient) {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		client.shutdown()
		_ = client.conn.Close()
	}()
	for {
		select {
		case payload, ok := <-client.send:
			if !ok {
				_ = client.conn.WriteControl(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
					time.Now().Add(wsWriteWait))
				return
			}
			_ = client.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := client.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = client.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (a *API) wsReadPump(client *proctorClient, examID string) {
	defer func() {
		a.hub.leave(client)
		client.shutdown()
		_ = client.conn.Close()
		a.log.Info("proctor websocket closed", "exam_id", examID, "user_id", client.userID)
	}()
	client.conn.SetReadLimit(wsReadLimit)
	_ = client.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	client.conn.SetPongHandler(func(string) error {
		return client.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})
	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			return
		}
		var inbound wsInbound
		_ = json.Unmarshal(message, &inbound)
		if inbound.Type != "ping" {
			continue
		}
		payload, err := json.Marshal(map[string]any{"type": "pong", "timestamp": time.Now()})
		if err != nil {
			return
		}
		if !client.push(payload) {
			return
		}
	}
}
