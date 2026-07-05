package com.aditistays.chatservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Mirrors chat-service's Python Settings: every value is read directly from
 * the process environment (not application.yml) so the README's documented
 * env vars keep working unchanged.
 */
public record AppProperties(
        String databaseUrl,
        String redisUrl,
        String leadNotificationChannel,
        String chatEventsChannel,
        String uploadDir,
        String publicBaseUrl,
        int maxUploadSizeMb,
        int bannerMaxUploadSizeMb,
        String storageBackend,
        String s3Bucket,
        String s3Region,
        String s3EndpointUrl,
        String s3PublicBaseUrl,
        String s3Prefix,
        String adminChatToken,
        String userChatTokenSecret,
        int chatRateLimitPerMinute,
        String whatsappProvider,
        String twilioAccountSid,
        String twilioAuthToken,
        String twilioWhatsappFrom,
        String metaWhatsappToken,
        String metaPhoneNumberId,
        String crmServiceUrl
) {

    @Configuration
    public static class Factory {
        @Bean
        public AppProperties appProperties() {
            return load();
        }
    }

    public static AppProperties load() {
        String databaseUrl = getEnv("DATABASE_URL", "");
        if (databaseUrl.isBlank()) {
            throw new IllegalStateException("DATABASE_URL is required");
        }

        String adminChatToken = getEnv("ADMIN_CHAT_TOKEN", "").trim();
        String userChatTokenSecret = getEnv("USER_CHAT_TOKEN_SECRET", "").trim();
        requireSecret("ADMIN_CHAT_TOKEN", adminChatToken);
        requireSecret("USER_CHAT_TOKEN_SECRET", userChatTokenSecret);

        return new AppProperties(
                databaseUrl,
                getEnv("REDIS_URL", "redis://localhost:6379/0"),
                getEnv("LEAD_NOTIFICATION_CHANNEL", "lead_notifications"),
                getEnv("CHAT_EVENTS_CHANNEL", "chat_events"),
                getEnv("UPLOAD_DIR", "uploads"),
                getEnv("PUBLIC_BASE_URL", "http://localhost:8000"),
                Integer.parseInt(getEnv("MAX_UPLOAD_SIZE_MB", "8")),
                Integer.parseInt(getEnv("BANNER_MAX_UPLOAD_SIZE_MB", "120")),
                getEnv("STORAGE_BACKEND", "local").toLowerCase(),
                getEnv("S3_BUCKET", ""),
                getEnv("S3_REGION", ""),
                getEnv("S3_ENDPOINT_URL", ""),
                getEnv("S3_PUBLIC_BASE_URL", ""),
                getEnv("S3_PREFIX", "payment-proofs"),
                adminChatToken,
                userChatTokenSecret,
                Integer.parseInt(getEnv("CHAT_RATE_LIMIT_PER_MINUTE", "180")),
                getEnv("WHATSAPP_PROVIDER", "stub").toLowerCase(),
                getEnv("TWILIO_ACCOUNT_SID", ""),
                getEnv("TWILIO_AUTH_TOKEN", ""),
                getEnv("TWILIO_WHATSAPP_FROM", ""),
                getEnv("META_WHATSAPP_TOKEN", ""),
                getEnv("META_PHONE_NUMBER_ID", ""),
                getEnv("CRM_SERVICE_URL", "http://localhost:8080")
        );
    }

    private static void requireSecret(String key, String value) {
        if (value.isEmpty()) {
            throw new IllegalStateException(key + " is required");
        }
        if (value.toLowerCase().contains("change-me")) {
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
}
