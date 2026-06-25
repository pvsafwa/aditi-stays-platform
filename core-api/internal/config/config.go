package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                     string
	DatabaseURL              string
	RedisAddr                string
	RedisPassword            string
	RedisDB                  int
	ChatNotificationChannel  string
	AdminAPIToken            string
	UserChatTokenSecret      string
	UserChatTokenTTL         time.Duration
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
	userChatTokenSecret := strings.TrimSpace(os.Getenv("USER_CHAT_TOKEN_SECRET"))
	if err := requireStrongSecret("USER_CHAT_TOKEN_SECRET", userChatTokenSecret); err != nil {
		return nil, err
	}
	// Lead-scoped chat tokens are short-lived; a returning customer is re-issued a
	// fresh token through check-availability, so this only needs to outlast a single
	// active inquiry. Default 30 days, configurable, bounded to a sane range.
	chatTokenTTLHours, err := getEnvIntInRange("USER_CHAT_TOKEN_TTL_HOURS", 24*30, 1, 24*365)
	if err != nil {
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
		UserChatTokenSecret:      userChatTokenSecret,
		UserChatTokenTTL:         time.Duration(chatTokenTTLHours) * time.Hour,
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

func getEnvIntInRange(key string, fallback, min, max int) (int, error) {
	raw := getEnv(key, strconv.Itoa(fallback))
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s value %q", key, raw)
	}
	if v < min || v > max {
		return 0, fmt.Errorf("%s must be between %d and %d", key, min, max)
	}
	return v, nil
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
