package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type Claims struct {
	Email     string `json:"email"`
	Actor     string `json:"actor"`
	Role      string `json:"role"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

type Manager struct {
	secret []byte
}

func NewManager(secret string) *Manager {
	return &Manager{secret: []byte(secret)}
}

func (m *Manager) IssueAdminSession(email, actor string, ttl time.Duration) (string, *Claims, error) {
	now := time.Now().UTC()
	claims := &Claims{
		Email:     email,
		Actor:     actor,
		Role:      "admin",
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(ttl).Unix(),
	}
	token, err := m.sign(claims)
	if err != nil {
		return "", nil, err
	}
	return token, claims, nil
}

func (m *Manager) Verify(token string) (*Claims, error) {
	if token == "" {
		return nil, errors.New("session token is required")
	}
	payloadB64, sigB64, ok := splitToken(token)
	if !ok {
		return nil, errors.New("invalid session token format")
	}
	expectedSig := m.signBytes(payloadB64)
	actualSig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, errors.New("invalid session token signature")
	}
	if subtle.ConstantTimeCompare(actualSig, expectedSig) != 1 {
		return nil, errors.New("session token signature mismatch")
	}
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, errors.New("invalid session token payload")
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, errors.New("invalid session token claims")
	}
	if claims.Role != "admin" {
		return nil, errors.New("invalid session role")
	}
	if claims.Email == "" || claims.Actor == "" {
		return nil, errors.New("incomplete session claims")
	}
	if claims.ExpiresAt <= time.Now().UTC().Unix() {
		return nil, errors.New("session token expired")
	}
	return &claims, nil
}

func (m *Manager) sign(claims *Claims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)
	sig := m.signBytes(payloadB64)
	return payloadB64 + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func (m *Manager) signBytes(payload string) []byte {
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func splitToken(token string) (string, string, bool) {
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			return token[:i], token[i+1:], token[:i] != "" && token[i+1:] != ""
		}
	}
	return "", "", false
}
