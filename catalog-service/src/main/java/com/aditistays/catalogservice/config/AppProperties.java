package com.aditistays.catalogservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Every value is read directly from the process environment (not Spring's
 * application.yml) so the env vars documented in the README keep working
 * unchanged.
 */
public record AppProperties(
        String databaseUrl,
        int globalRateLimitPerMinute
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

        int globalRate = getEnvIntMin("GLOBAL_RATE_LIMIT_PER_MINUTE", 120, 1);

        return new AppProperties(
                databaseUrl,
                globalRate
        );
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
}
