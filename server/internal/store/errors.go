package store

import "errors"

var (
	ErrNotFound              = errors.New("resource not found")
	ErrConflict              = errors.New("resource conflict")
	ErrInvalidState          = errors.New("invalid state")
	ErrForbidden             = errors.New("forbidden")
	ErrInsufficientQuestions = errors.New("insufficient questions")
	ErrTooEarly              = errors.New("exam not started")
	ErrExpired               = errors.New("exam expired")
)
