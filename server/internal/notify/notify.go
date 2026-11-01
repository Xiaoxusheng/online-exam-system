// Package notify delivers outbound messages through pluggable channels.
// Email rides on a plain SMTP account; SMS goes through a generic JSON
// gateway. Without configuration a channel reports itself disabled and the
// store simply skips external deliveries — in-app notifications never depend
// on this package.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"online-exam-system/server/internal/config"
)

// Dispatcher implements the store.ExternalNotifier contract.
type Dispatcher struct {
	smtpHost     string
	smtpPort     string
	smtpUsername string
	smtpPassword string
	smtpFrom     string

	smsAPIURL   string
	smsAPIToken string

	log    *slog.Logger
	client *http.Client
}

func NewDispatcher(cfg config.Config, log *slog.Logger) *Dispatcher {
	return &Dispatcher{
		smtpHost:     cfg.SMTPHost,
		smtpPort:     cfg.SMTPPort,
		smtpUsername: cfg.SMTPUsername,
		smtpPassword: cfg.SMTPPassword,
		smtpFrom:     cfg.SMTPFrom,
		smsAPIURL:    cfg.SMSAPIURL,
		smsAPIToken:  cfg.SMSAPIToken,
		log:          log,
		client:       &http.Client{Timeout: 10 * time.Second},
	}
}

func (d *Dispatcher) EmailConfigured() bool {
	return d.smtpHost != "" && d.smtpFrom != ""
}

// SMSConfigured reports whether a real gateway is wired; without one the
// channel still "sends" so the delivery ledger shows the simulated path.
func (d *Dispatcher) SMSConfigured() bool {
	return d.smsAPIURL != ""
}

// Send delivers one message. Returned status values match the notifications
// ledger: sent | failed | simulated.
func (d *Dispatcher) Send(ctx context.Context, channel, to, subject, body string) (string, error) {
	switch channel {
	case "email":
		if !d.EmailConfigured() {
			return "failed", fmt.Errorf("SMTP is not configured")
		}
		if err := d.sendEmail(to, subject, body); err != nil {
			return "failed", err
		}
		return "sent", nil
	case "sms":
		if !d.SMSConfigured() {
			d.log.Warn("sms gateway not configured, delivery simulated", "to", to)
			return "simulated", nil
		}
		if err := d.sendSMS(ctx, to, body); err != nil {
			return "failed", err
		}
		return "sent", nil
	default:
		return "failed", fmt.Errorf("unknown channel %q", channel)
	}
}

func (d *Dispatcher) sendEmail(to, subject, body string) error {
	addr := d.smtpHost + ":" + d.smtpPort
	host, _, err := splitHostPort(addr)
	if err != nil {
		return err
	}

	from := d.smtpFrom
	var auth smtp.Auth
	if d.smtpUsername != "" {
		auth = smtp.PlainAuth("", d.smtpUsername, d.smtpPassword, host)
	}

	msg := &bytes.Buffer{}
	msg.WriteString("From: " + from + "\r\n")
	msg.WriteString("To: " + to + "\r\n")
	// Non-ASCII subjects must be MIME encoded or mail agents show mojibake.
	msg.WriteString("Subject: " + mime.QEncoding.Encode("UTF-8", subject) + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	msg.WriteString(body)
	msg.WriteString("\r\n")

	return smtp.SendMail(addr, auth, from, []string{to}, msg.Bytes())
}

type smsGatewayPayload struct {
	Phone   string `json:"phone"`
	Content string `json:"content"`
}

func (d *Dispatcher) sendSMS(ctx context.Context, phone, content string) error {
	payload, err := json.Marshal(smsGatewayPayload{Phone: phone, Content: content})
	if err != nil {
		return fmt.Errorf("marshal sms payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.smsAPIURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build sms request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if d.smsAPIToken != "" {
		req.Header.Set("Authorization", "Bearer "+d.smsAPIToken)
	}
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("call sms gateway: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("sms gateway returned %s", resp.Status)
	}
	return nil
}

func splitHostPort(addr string) (string, string, error) {
	index := strings.LastIndex(addr, ":")
	if index < 0 {
		return addr, "", nil
	}
	host := strings.Trim(addr[:index], "[]")
	port := addr[index+1:]
	if _, err := strconv.Atoi(port); err != nil {
		return "", "", fmt.Errorf("invalid smtp address %q", addr)
	}
	return host, port, nil
}
