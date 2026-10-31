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
	hub    *proctorHub
}

func New(cfg config.Config, log *slog.Logger, st *store.Store, tokens *auth.TokenManager) *API {
	return &API{cfg: cfg, log: log, store: st, tokens: tokens, hub: newProctorHub(log)}
}

func (a *API) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, a.requestLogger, a.recoverer, a.cors, a.bodyLimit)

	r.Get("/healthz", a.handleHealth)
	r.Get("/readyz", a.handleReady)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", a.handleLogin)

		// Proctor realtime room. Browsers cannot attach an Authorization header to a
		// websocket, so this route authenticates its ?token= parameter itself.
		r.Get("/proctor/exams/{examId}/ws", a.handleProctorWebSocket)

		r.Group(func(r chi.Router) {
			r.Use(a.authenticate)

			r.Get("/auth/me", a.handleMe)
			r.Post("/auth/logout", a.handleLogout)
			r.Get("/dashboard/summary", a.handleDashboard)
			r.Get("/notifications", a.handleListNotifications)
			r.Patch("/notifications/{id}/read", a.handleMarkNotificationRead)

			// Organization & system administration.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("org_admin"))
				r.Get("/campuses", a.handleListCampuses)
				r.Post("/campuses", a.handleCreateCampus)
				r.Post("/users", a.handleCreateUser)
				r.Patch("/users/{id}", a.handleUpdateUser)
				r.Get("/roles", a.handleRoles)
				r.Get("/audit-logs", a.handleListAuditLogs)
				r.Get("/notification-templates", a.handleListNotificationTemplates)
				r.Get("/system/overview", a.handleSystemOverview)
			})

			r.Group(func(r chi.Router) {
				// 考务编排考生需要读取学员名册，账号写操作仍限机构管理员。
				r.Use(a.requireRoles("org_admin", "exam_admin"))
				r.Get("/users", a.handleListUsers)
			})

			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("org_admin", "exam_admin"))
				r.Get("/classes", a.handleListClasses)
				r.Post("/classes", a.handleCreateClass)
			})

			// Question bank & papers.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("teacher", "exam_admin"))
				r.Get("/question-banks", a.handleListQuestionBanks)
				r.Post("/question-banks", a.handleCreateQuestionBank)
				r.Get("/questions", a.handleListQuestions)
				r.Post("/questions", a.handleCreateQuestion)
				r.Get("/questions/{id}", a.handleGetQuestion)
				r.Put("/questions/{id}", a.handleUpdateQuestion)
				r.With(a.requireRoles("teacher")).Post("/questions/{id}/publish", a.handlePublishQuestion)
				r.Get("/papers", a.handleListPapers)
				r.Post("/papers", a.handleCreatePaper)
				r.Get("/papers/{id}", a.handleGetPaper)
				r.Put("/papers/{id}", a.handleUpdatePaper)
				r.With(a.requireRoles("teacher")).Post("/papers/{id}/submit-review", a.handleSubmitPaperReview)
				r.With(a.requireRoles("exam_admin")).Post("/papers/{id}/approve", a.handleApprovePaper)
			})

			// Exam planning.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("exam_admin"))
				r.Get("/exams", a.handleListExams)
				r.Post("/exams", a.handleCreateExam)
				r.Get("/exams/{id}", a.handleGetExam)
				r.Post("/exams/{id}/publish", a.handlePublishExam)
				r.Get("/exams/{id}/candidates", a.handleListExamCandidates)
				r.Post("/exams/{id}/candidates", a.handleAddExamCandidates)
				r.Get("/exams/{id}/proctors", a.handleListExamProctors)
				r.Put("/exams/{id}/proctors", a.handleSetExamProctors)
				r.Get("/exams/{id}/reviewers", a.handleListExamReviewers)
				r.Put("/exams/{id}/reviewers", a.handleSetExamReviewers)
			})

			// Candidate taking exams.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("student"))
				r.Get("/my/exams", a.handleMyExams)
				r.Post("/exams/{id}/attempts", a.handleStartAttempt)
				r.Get("/attempts/{id}", a.handleGetAttempt)
				r.Put("/attempts/{id}/answers/{questionId}", a.handleSaveAnswer)
				r.Post("/attempts/{id}/submit", a.handleSubmitAttempt)
				r.Post("/attempts/{id}/events", a.handleCreateProctorEvent)
				r.Get("/my/scores", a.handleMyScores)
				r.Get("/my/scores/{attemptId}", a.handleMyScoreRecord)
			})

			// Proctoring. Proctors are limited to the exams they are assigned to.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("proctor", "exam_admin"))
				r.Get("/proctor/exams", a.handleProctorRooms)
				r.Get("/proctor/exams/{examId}/overview", a.handleProctorOverview)
				r.Get("/proctor/exams/{examId}/events", a.handleListProctorEvents)
				r.Post("/proctor/events/{eventId}/handle", a.handleHandleProctorEvent)
			})

			// Review & grading. Reviewers only see the tasks assigned to them.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("reviewer", "exam_admin"))
				r.Get("/review-tasks", a.handleListReviewTasks)
				r.Get("/review-tasks/{id}", a.handleGetReviewTask)
				r.Post("/review-tasks/{id}/submit", a.handleSubmitReview)
			})

			// Scores & analytics.
			r.Group(func(r chi.Router) {
				r.Use(a.requireRoles("exam_admin", "teacher"))
				r.Get("/scores", a.handleListScores)
				r.Get("/scores/{attemptId}", a.handleGetScore)
				r.Get("/analytics/exams/{examId}", a.handleExamAnalytics)
				r.With(a.requireRoles("exam_admin")).Post("/scores/publish", a.handlePublishScores)
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
