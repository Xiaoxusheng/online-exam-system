package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

// Pre-computed so unknown-account logins still spend time hashing (timing mitigation).
const dummyPasswordHash = "$2a$12$EEwqEw4fir75OqZVdid4Aee4shEbFRyH5qvZlahzo9YPMbpMgyGzu"

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func BurnPasswordCheck(password string) {
	_ = bcrypt.CompareHashAndPassword([]byte(dummyPasswordHash), []byte(password))
}
