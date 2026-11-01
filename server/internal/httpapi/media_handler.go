package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"online-exam-system/server/internal/store"
)

// mediaMimeExts maps every accepted upload MIME type to a file extension. The
// extension comes from this table, never from the client-supplied filename.
var mediaMimeExts = map[string]string{
	"image/png":      "png",
	"image/jpeg":     "jpg",
	"image/webp":     "webp",
	"image/gif":      "gif",
	"audio/mpeg":     "mp3",
	"audio/mp4":      "m4a",
	"audio/x-m4a":    "m4a",
	"audio/wav":      "wav",
	"audio/x-wav":    "wav",
	"audio/ogg":      "ogg",
	"audio/webm":     "weba",
	"video/mp4":      "mp4",
	"video/webm":     "webm",
	"video/quicktime": "mov",
}

// studentMediaPurposes limits what a candidate may upload: their own answer
// recordings and proctoring snapshots. Staff may upload anything.
var studentMediaPurposes = map[string]struct{}{
	"answer_media":     {},
	"proctor_snapshot": {},
}

func mediaExtFor(mime string) string {
	if ext, ok := mediaMimeExts[strings.ToLower(strings.TrimSpace(mime))]; ok {
		return ext
	}
	return ""
}

type mediaUploadResult struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Mime     string `json:"mime"`
	Size     int64  `json:"size_bytes"`
	URL      string `json:"url"`
}

func (a *API) handleUploadMedia(w http.ResponseWriter, r *http.Request) {
	claims, actor, ok := a.resolveAuth(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "上传内容无效或超过大小限制")
		return
	}
	purpose := strings.TrimSpace(r.FormValue("purpose"))
	if !validOneOf(purpose, "question_asset", "answer_media", "branding", "proctor_snapshot", "other") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "purpose 取值不正确")
		return
	}
	if claims.Role == "student" {
		if _, allowed := studentMediaPurposes[purpose]; !allowed {
			apiError(w, http.StatusForbidden, "FORBIDDEN", "考生仅可上传作答音视频与抓拍")
			return
		}
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "缺少 file 字段")
		return
	}
	defer file.Close() //nolint:errcheck

	mime := strings.ToLower(strings.TrimSpace(header.Header.Get("Content-Type")))
	ext := mediaExtFor(mime)
	if ext == "" {
		apiError(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "不支持的文件类型")
		return
	}
	size, digest, err := a.storeMediaBytes(file, ext, claims.OrgID, purpose)
	if err != nil {
		if errors.Is(err, errUploadTooLarge) {
			apiError(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "文件超过大小限制")
			return
		}
		a.log.Error("store media bytes failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "文件保存失败")
		return
	}

	created, err := a.store.CreateMediaFile(r.Context(), store.MediaFile{
		OrgID:      claims.OrgID,
		UploaderID: actor.ID,
		Purpose:    purpose,
		Filename:   sanitizeFilename(header.Filename),
		Mime:       mime,
		SizeBytes:  size,
		SHA256:     digest,
		StorageKey: storageKeyPath(claims.OrgID, purpose, ext),
	})
	if err != nil {
		a.log.Error("create media file failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "文件登记失败")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: actor.ID, Action: "media.uploaded",
		TargetType: "media", TargetID: created.ID,
		Detail: map[string]any{"purpose": purpose, "mime": mime, "size_bytes": size},
	})
	data(w, http.StatusCreated, mediaUploadResult{
		ID: created.ID, Filename: created.Filename, Mime: created.Mime,
		Size: created.SizeBytes, URL: mediaPublicURL(created.ID),
	})
}

var errUploadTooLarge = errors.New("upload exceeds limit")

// storeMediaBytes streams the upload to disk under MEDIA_DIR while hashing it,
// so a 64 MB recording never sits in memory. Caller has validated the MIME.
func (a *API) storeMediaBytes(file multipart.File, ext, orgID, purpose string) (int64, string, error) {
	dir := filepath.Join(a.cfg.MediaDir, "incoming")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return 0, "", fmt.Errorf("prepare media dir: %w", err)
	}
	tmp, err := os.CreateTemp(dir, "upload-*")
	if err != nil {
		return 0, "", fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) //nolint:errcheck

	hash := sha256.New()
	limit := a.cfg.MaxUploadBytes + 1
	written, err := io.Copy(io.MultiWriter(tmp, hash), io.LimitReader(file, limit))
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return 0, "", fmt.Errorf("write upload: %w", err)
	}
	if written > a.cfg.MaxUploadBytes {
		return 0, "", errUploadTooLarge
	}

	key := storageKeyPath(orgID, purpose, ext)
	final := filepath.Join(a.cfg.MediaDir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(final), 0o755); err != nil {
		return 0, "", fmt.Errorf("prepare media path: %w", err)
	}
	if err := os.Rename(tmpName, final); err != nil {
		return 0, "", fmt.Errorf("move upload into place: %w", err)
	}
	return written, hex.EncodeToString(hash.Sum(nil)), nil
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	name = filepath.Base(name)
	if name == "." || name == ".." || name == "/" || name == "\\" {
		return ""
	}
	const maxName = 200
	if len([]rune(name)) > maxName {
		runes := []rune(name)
		name = string(runes[len(runes)-maxName:])
	}
	return name
}

func storageKeyPath(orgID, purpose, ext string) string {
	// Layout: <org>/<purpose>/<yyyy>/<mm>/<random>.<ext>
	return fmt.Sprintf("%s/%s/%04d/%02d/%s.%s",
		orgID, purpose, time.Now().Year(), int(time.Now().Month()), newMediaKey(), ext)
}

// newMediaKey returns a random url-safe file stem (never client-controlled).
func newMediaKey() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Sprintf("media key randomness unavailable: %v", err))
	}
	return hex.EncodeToString(buf)
}

func mediaPublicURL(id string) string { return "/api/v1/media/" + id + "/content" }

func (a *API) handleMediaContent(w http.ResponseWriter, r *http.Request) {
	claims, _, ok := a.resolveAuth(w, r)
	if !ok {
		return
	}
	mediaID, ok := parseUUIDParam(w, pathParam(r, "id"), "媒体 ID")
	if !ok {
		return
	}
	item, err := a.store.GetMediaFile(r.Context(), claims.OrgID, mediaID)
	if err != nil {
		a.storeError(w, r, err, "媒体不存在")
		return
	}
	// Sensitive purposes stay visible only to their owner plus staff roles; the
	// <audio>/<video> tags reach this route through ?token= instead of a header.
	if item.Purpose == "answer_media" || item.Purpose == "proctor_snapshot" {
		owner := item.UploaderID == claims.Subject
		staff := claims.Role == "org_admin" || claims.Role == "exam_admin" ||
			claims.Role == "reviewer" || claims.Role == "proctor"
		if !owner && !staff {
			apiError(w, http.StatusForbidden, "FORBIDDEN", "无权访问该媒体")
			return
		}
	}

	final := filepath.Join(a.cfg.MediaDir, filepath.FromSlash(item.StorageKey))
	f, err := os.Open(final) // #nosec G304 -- storage_key comes from the server-side media table
	if err != nil {
		a.log.Error("open media file failed", "error", err, "key", item.StorageKey)
		apiError(w, http.StatusNotFound, "NOT_FOUND", "媒体文件已丢失")
		return
	}
	defer f.Close() //nolint:errcheck

	w.Header().Set("Content-Type", item.Mime)
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "media."+mediaExtFor(item.Mime), item.CreatedAt, f)
}

func (a *API) handleDeleteMedia(w http.ResponseWriter, r *http.Request) {
	claims, actor, ok := a.resolveAuth(w, r)
	if !ok {
		return
	}
	mediaID, ok := parseUUIDParam(w, pathParam(r, "id"), "媒体 ID")
	if !ok {
		return
	}
	admin := claims.Role == "org_admin"
	if err := a.store.MarkMediaDeleted(r.Context(), claims.OrgID, mediaID, actor.ID, admin); err != nil {
		a.storeError(w, r, err, "媒体不存在或无权删除")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: actor.ID, Action: "media.deleted",
		TargetType: "media", TargetID: mediaID,
	})
	data(w, http.StatusOK, map[string]string{"id": mediaID, "status": "deleted"})
}
