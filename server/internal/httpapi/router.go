package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/config"
	"online-exam-system/server/internal/store"
)

type API struct {
	cfg    config.Config
	log    *slog.Logger
	store  *store.Store
	tokens *auth.TokenManager
}

func New(cfg config.Config, log *slog.Logger, st *store.Store, tokens *auth.TokenManager) *API {
	return &API{cfg: cfg, log: log, store: st, tokens: tokens}
}

func (a *API) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, a.requestLogger, a.recoverer, a.cors, a.bodyLimit)

	r.Get("/healthz", a.handleHealth)
	r.Get("/readyz", a.handleReady)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", a.handleLogin)

		r.Group(func(r chi.Router) {
			r.Use(a.authenticate)

			r.Get("/auth/me", a.handleMe)
			r.Post("/auth/logout", a.handleLogout)
			r.Get("/dashboard/summary", a.handleDashboard)
			r.Get("/notifications", emptyListHandler)

			// Organization & system administration.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("org_admin"))
				r.Get("/campuses", emptyListHandler)
				r.Post("/campuses", notImplementedHandler)
				r.Get("/users", emptyListHandler)
				r.Post("/users", notImplementedHandler)
				r.Patch("/users/{id}", notImplementedHandler)
				r.Get("/roles", a.handleRoles)
				r.Get("/audit-logs", emptyListHandler)
				r.Get("/notification-templates", emptyListHandler)
				r.Get("/system/overview", notImplementedHandler)
			})

			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("org_admin", "exam_admin"))
				r.Get("/classes", emptyListHandler)
				r.Post("/classes", notImplementedHandler)
			})

			// Question bank & papers.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("teacher", "exam_admin"))
				r.Get("/question-banks", emptyListHandler)
				r.Post("/question-banks", notImplementedHandler)
				r.Get("/questions", emptyListHandler)
				r.Post("/questions", notImplementedHandler)
				r.Get("/questions/{id}", notImplementedHandler)
				r.Put("/questions/{id}", notImplementedHandler)
				r.Get("/papers", emptyListHandler)
				r.Post("/papers", notImplementedHandler)
				r.Get("/papers/{id}", notImplementedHandler)
				r.Post("/papers/{id}/submit-review", notImplementedHandler)
				r.With(a.requireRoles("exam_admin")).Post("/papers/{id}/approve", notImplementedHandler)
			})

			// Exam planning.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("exam_admin"))
				r.Get("/exams", emptyListHandler)
				r.Post("/exams", notImplementedHandler)
				r.Get("/exams/{id}", notImplementedHandler)
				r.Post("/exams/{id}/publish", notImplementedHandler)
				r.Get("/exams/{id}/candidates", emptyListHandler)
			})

			// Candidate taking exams.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("student"))
				r.Get("/my/exams", emptyListHandler)
				r.Post("/exams/{id}/attempts", notImplementedHandler)
				r.Get("/attempts/{id}", notImplementedHandler)
				r.Put("/attempts/{id}/answers/{questionId}", notImplementedHandler)
				r.Post("/attempts/{id}/submit", notImplementedHandler)
				r.Get("/my/scores", emptyListHandler)
			})

			// Proctoring.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("proctor", "exam_admin"))
				r.Get("/proctor/exams/{examId}/overview", notImplementedHandler)
				r.Get("/proctor/exams/{examId}/events", emptyListHandler)
				r.Post("/proctor/events/{eventId}/handle", notImplementedHandler)
				r.Get("/proctor/exams/{examId}/ws", notImplementedHandler)
			})

			// Review & grading.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("reviewer"))
				r.Get("/review-tasks", emptyListHandler)
				r.Get("/review-tasks/{id}", notImplementedHandler)
				r.Post("/review-tasks/{id}/submit", notImplementedHandler)
			})

			// Scores & analytics.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("exam_admin", "teacher"))
				r.Get("/scores", emptyListHandler)
				r.Get("/analytics/exams/{examId}", notImplementedHandler)
				r.With(a.requireRoles("exam_admin")).Post("/scores/publish", notImplementedHandler)
			})
		})
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		apiError(w, http.StatusNotFound, "NOT_FOUND", "接口不存在")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		apiError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "请求方法不允许")
	})

	return r
}

func (a *API) handleHealth(w http.ResponseWriter, _ *http.Request) {
	data(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.store.Pool().Ping(ctx); err != nil {
		a.log.Error("readiness check failed", "error", err)
		apiError(w, http.StatusServiceUnavailable, "NOT_READY", "数据库不可用")
		return
	}
	data(w, http.StatusOK, map[string]string{"status": "ready"})
}
