package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                     string
	DatabaseURL              string
	RedisAddr                string
	RedisPassword            string
	RedisDB                  int
	ChatNotificationChannel  string
	AdminAPIToken            string
	AdminLoginEmail          string
	AdminLoginPasswordHash   string
	AdminLoginDisplayName    string
	AdminSessionSecret       string
	AdminSessionCookieName   string
	AdminSessionTTLHours     int
	AdminSessionSecure       bool
	UserChatTokenSecret      string
	GlobalRateLimitPerMinute int
	LeadRateLimitPerMinute   int
	CORSAllowedOrigins       []string
}

func Load() (*Config, error) {
	port := getEnv("APP_PORT", "8080")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")
	redisDB, err := getEnvIntMin("REDIS_DB", 0, 0)
	if err != nil {
		return nil, err
	}

	channel := getEnv("CHAT_NOTIFICATION_CHANNEL", "lead_notifications")
	adminToken := strings.TrimSpace(os.Getenv("ADMIN_API_TOKEN"))
	if err := requireStrongSecret("ADMIN_API_TOKEN", adminToken); err != nil {
		return nil, err
	}
	adminLoginEmail := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_LOGIN_EMAIL")))
	if adminLoginEmail == "" {
		return nil, fmt.Errorf("ADMIN_LOGIN_EMAIL is required")
	}
	adminLoginPasswordHash := strings.TrimSpace(os.Getenv("ADMIN_LOGIN_PASSWORD_HASH"))
	if adminLoginPasswordHash == "" {
		return nil, fmt.Errorf("ADMIN_LOGIN_PASSWORD_HASH is required")
	}
	adminLoginDisplayName := strings.TrimSpace(getEnv("ADMIN_LOGIN_DISPLAY_NAME", "admin-ops"))
	adminSessionSecret := strings.TrimSpace(os.Getenv("ADMIN_SESSION_SECRET"))
	if err := requireStrongSecret("ADMIN_SESSION_SECRET", adminSessionSecret); err != nil {
		return nil, err
	}
	adminSessionCookieName := strings.TrimSpace(getEnv("ADMIN_SESSION_COOKIE_NAME", "aditi_admin_session"))
	if adminSessionCookieName == "" {
		return nil, fmt.Errorf("ADMIN_SESSION_COOKIE_NAME is required")
	}
	adminSessionTTLHours, err := getEnvIntMin("ADMIN_SESSION_TTL_HOURS", 12, 1)
	if err != nil {
		return nil, err
	}
	adminSessionSecure := getEnvBool("ADMIN_SESSION_SECURE", false)
	userChatTokenSecret := strings.TrimSpace(os.Getenv("USER_CHAT_TOKEN_SECRET"))
	if err := requireStrongSecret("USER_CHAT_TOKEN_SECRET", userChatTokenSecret); err != nil {
		return nil, err
	}
	globalRate, err := getEnvIntMin("GLOBAL_RATE_LIMIT_PER_MINUTE", 120, 1)
	if err != nil {
		return nil, err
	}
	leadRate, err := getEnvIntMin("LEAD_RATE_LIMIT_PER_MINUTE", 20, 1)
	if err != nil {
		return nil, err
	}
	corsAllowedOrigins := parseCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"))
	if len(corsAllowedOrigins) == 0 {
		return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS must include at least one origin")
	}

	return &Config{
		Port:                     port,
		DatabaseURL:              dbURL,
		RedisAddr:                redisAddr,
		RedisPassword:            redisPassword,
		RedisDB:                  redisDB,
		ChatNotificationChannel:  channel,
		AdminAPIToken:            adminToken,
		AdminLoginEmail:          adminLoginEmail,
		AdminLoginPasswordHash:   adminLoginPasswordHash,
		AdminLoginDisplayName:    adminLoginDisplayName,
		AdminSessionSecret:       adminSessionSecret,
		AdminSessionCookieName:   adminSessionCookieName,
		AdminSessionTTLHours:     adminSessionTTLHours,
		AdminSessionSecure:       adminSessionSecure,
		UserChatTokenSecret:      userChatTokenSecret,
		GlobalRateLimitPerMinute: globalRate,
		LeadRateLimitPerMinute:   leadRate,
		CORSAllowedOrigins:       corsAllowedOrigins,
	}, nil
}

func requireStrongSecret(key, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", key)
	}
	lower := strings.ToLower(value)
	if strings.Contains(lower, "change-me") {
		return fmt.Errorf("%s must not use a placeholder secret", key)
	}
	if len(value) < 24 {
		return fmt.Errorf("%s must be at least 24 characters long", key)
	}
	return nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvIntMin(key string, fallback int, min int) (int, error) {
	raw := getEnv(key, strconv.Itoa(fallback))
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s value %q", key, raw)
	}
	if v < min {
		return 0, fmt.Errorf("%s must be >= %d", key, min)
	}
	return v, nil
}

func getEnvBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(getEnv(key, "")))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func parseCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}
