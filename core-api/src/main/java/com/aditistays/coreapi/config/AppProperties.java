package com.aditistays.coreapi.config;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Mirrors core-api's Go config.Load(): every value is read directly from the
 * process environment (not Spring's application.yml) so the same env vars
 * documented in the README keep working unchanged.
 */
public record AppProperties(
        String databaseUrl,
        String redisAddr,
        String redisPassword,
        int redisDb,
        String chatNotificationChannel,
        String adminApiToken,
        String userChatTokenSecret,
        Duration userChatTokenTtl,
        int globalRateLimitPerMinute,
        int leadRateLimitPerMinute,
        List<String> corsAllowedOrigins
) {

    @Configuration
    public static class Factory {
        @Bean
        public AppProperties appProperties() {
            return load();
        }
    }

    public static AppProperties load() {
        String databaseUrl = System.getenv("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank()) {
            throw new IllegalStateException("DATABASE_URL is required");
        }

        String redisAddr = getEnv("REDIS_ADDR", "localhost:6379");
        String redisPassword = getEnv("REDIS_PASSWORD", "");
        int redisDb = getEnvIntMin("REDIS_DB", 0, 0);

        String channel = getEnv("CHAT_NOTIFICATION_CHANNEL", "lead_notifications");
        String adminToken = System.getenv("ADMIN_API_TOKEN") == null ? "" : System.getenv("ADMIN_API_TOKEN").trim();
        requireStrongSecret("ADMIN_API_TOKEN", adminToken);
        String userChatTokenSecret = System.getenv("USER_CHAT_TOKEN_SECRET") == null ? "" : System.getenv("USER_CHAT_TOKEN_SECRET").trim();
        requireStrongSecret("USER_CHAT_TOKEN_SECRET", userChatTokenSecret);

        int chatTokenTtlHours = getEnvIntInRange("USER_CHAT_TOKEN_TTL_HOURS", 24 * 30, 1, 24 * 365);
        int globalRate = getEnvIntMin("GLOBAL_RATE_LIMIT_PER_MINUTE", 120, 1);
        int leadRate = getEnvIntMin("LEAD_RATE_LIMIT_PER_MINUTE", 20, 1);

        List<String> corsAllowedOrigins = parseCsv(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"));
        if (corsAllowedOrigins.isEmpty()) {
            throw new IllegalStateException("CORS_ALLOWED_ORIGINS must include at least one origin");
        }

        return new AppProperties(
                databaseUrl,
                redisAddr,
                redisPassword,
                redisDb,
                channel,
                adminToken,
                userChatTokenSecret,
                Duration.ofHours(chatTokenTtlHours),
                globalRate,
                leadRate,
                corsAllowedOrigins
        );
    }

    private static void requireStrongSecret(String key, String value) {
        if (value.isEmpty()) {
            throw new IllegalStateException(key + " is required");
        }
        String lower = value.toLowerCase();
        if (lower.contains("change-me")) {
            throw new IllegalStateException(key + " must not use a placeholder secret");
        }
        if (value.length() < 24) {
            throw new IllegalStateException(key + " must be at least 24 characters long");
        }
    }

    private static String getEnv(String key, String fallback) {
        String val = System.getenv(key);
        return (val == null || val.isEmpty()) ? fallback : val;
    }

    private static int getEnvIntMin(String key, int fallback, int min) {
        String raw = getEnv(key, String.valueOf(fallback));
        int v;
        try {
            v = Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("invalid " + key + " value \"" + raw + "\"");
        }
        if (v < min) {
            throw new IllegalStateException(key + " must be >= " + min);
        }
        return v;
    }

    private static int getEnvIntInRange(String key, int fallback, int min, int max) {
        String raw = getEnv(key, String.valueOf(fallback));
        int v;
        try {
            v = Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("invalid " + key + " value \"" + raw + "\"");
        }
        if (v < min || v > max) {
            throw new IllegalStateException(key + " must be between " + min + " and " + max);
        }
        return v;
    }

    private static List<String> parseCsv(String raw) {
        Set<String> seen = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                seen.add(trimmed);
            }
        }
        return new ArrayList<>(seen);
    }
}
