package com.aditistays.coreapi.db;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Self-bootstraps every table, index, and seed row the application depends
 * on. Runs in @PostConstruct so it completes before the embedded web server
 * starts accepting connections (mirrors the Go binary calling EnsureSchema
 * before starting its HTTP listener) -- no external migration step required.
 */
@Component
@RequiredArgsConstructor
public class SchemaInitializer {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @PostConstruct
    public void ensureSchema() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS properties (
                    id TEXT PRIMARY KEY,
                    public_title TEXT NOT NULL,
                    location TEXT NOT NULL,
                    nightly_price NUMERIC(10,2) NOT NULL,
                    family_friendly BOOLEAN NOT NULL DEFAULT true,
                    amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
                    hero_image TEXT NOT NULL,
                    media JSONB NOT NULL DEFAULT '[]'::jsonb,
                    description TEXT NOT NULL,
                    active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS browsing_history (
                    id BIGSERIAL PRIMARY KEY,
                    visitor_id TEXT NOT NULL,
                    property_id TEXT NOT NULL REFERENCES properties(id),
                    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS wishlist_items (
                    id BIGSERIAL PRIMARY KEY,
                    visitor_id TEXT NOT NULL,
                    property_id TEXT NOT NULL REFERENCES properties(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(visitor_id, property_id)
                );
                CREATE TABLE IF NOT EXISTS leads (
                    id BIGSERIAL PRIMARY KEY,
                    visitor_id TEXT NOT NULL,
                    property_id TEXT NOT NULL REFERENCES properties(id),
                    customer_name TEXT NOT NULL,
                    mobile_number TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
                    disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
                    inventory_checked BOOLEAN NOT NULL DEFAULT false,
                    admin_notes TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id BIGSERIAL PRIMARY KEY,
                    lead_id BIGINT NOT NULL REFERENCES leads(id),
                    amount NUMERIC(10,2) NOT NULL,
                    payment_type TEXT NOT NULL CHECK (payment_type IN ('ADVANCE', 'FULL')),
                    source TEXT NOT NULL DEFAULT 'GPAY',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id BIGSERIAL PRIMARY KEY,
                    lead_id BIGINT NOT NULL REFERENCES leads(id),
                    sender_role TEXT NOT NULL,
                    sender_label TEXT NOT NULL,
                    message_type TEXT NOT NULL DEFAULT 'TEXT',
                    content TEXT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS payment_proofs (
                    id BIGSERIAL PRIMARY KEY,
                    lead_id BIGINT NOT NULL REFERENCES leads(id),
                    file_url TEXT NOT NULL,
                    uploaded_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id BIGSERIAL PRIMARY KEY,
                    actor TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    resource_type TEXT NOT NULL,
                    resource_id TEXT,
                    request_id TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_browsing_history_visitor ON browsing_history(visitor_id);
                CREATE INDEX IF NOT EXISTS idx_wishlist_visitor ON wishlist_items(visitor_id);
                CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
                CREATE INDEX IF NOT EXISTS idx_leads_visitor ON leads(visitor_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_lead ON chat_messages(lead_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS property_feedback (
                    id BIGSERIAL PRIMARY KEY,
                    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                    visitor_id TEXT NOT NULL,
                    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                    comment TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                DELETE FROM property_feedback a
                USING property_feedback b
                WHERE a.property_id = b.property_id
                  AND a.visitor_id = b.visitor_id
                  AND a.id > b.id;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_property_feedback_property_visitor
                    ON property_feedback(property_id, visitor_id);
                CREATE INDEX IF NOT EXISTS idx_property_feedback_property ON property_feedback(property_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS campaign_banners (
                    id BIGSERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    platform TEXT NOT NULL DEFAULT 'OTHER',
                    cover_url TEXT NOT NULL DEFAULT '',
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                ALTER TABLE campaign_banners
                    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
                CREATE INDEX IF NOT EXISTS idx_campaign_banners_active_created
                    ON campaign_banners(active, created_at DESC);
                UPDATE campaign_banners
                SET active=false, updated_at=NOW()
                WHERE active=true
                  AND (
                    platform IN ('INSTAGRAM', 'YOUTUBE')
                    OR lower(url) LIKE '%instagram.com/%'
                    OR lower(url) LIKE '%youtube.com/%'
                    OR lower(url) LIKE '%youtu.be/%'
                  );
                INSERT INTO campaign_banners (title, url, platform, cover_url, metadata, active)
                SELECT
                    'Flower Hero Loop',
                    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
                    'LOCAL_VIDEO',
                    'https://images.unsplash.com/photo-1527631746610-bca00a040d60',
                    '{"source":"seed_default"}'::jsonb,
                    true
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM campaign_banners
                    WHERE active=true
                      AND (
                        platform='LOCAL_VIDEO'
                        OR coalesce(metadata->>'mime_type', '') LIKE 'video/%'
                        OR url ~* '\\.(mp4|webm|mov|m4v|ogv)(\\?.*)?$'
                      )
                );
                """);

        ensureDefaultCatalog();
    }

    @SneakyThrows
    private void ensureDefaultCatalog() {
        for (CatalogSeeds.PropertySeed seed : CatalogSeeds.buildDefaultPropertySeeds()) {
            String amenitiesJson = objectMapper.writeValueAsString(seed.amenities());
            String mediaJson = objectMapper.writeValueAsString(seed.media());
            jdbc.update("""
                    INSERT INTO properties(id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active)
                    VALUES (?, ?, ?, ?, true, ?::jsonb, ?, ?::jsonb, ?, true)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    seed.id(), seed.id(), seed.location(), seed.nightlyPrice(),
                    amenitiesJson, seed.heroImage(), mediaJson, seed.description());
        }

        for (CatalogSeeds.BannerSeed seed : CatalogSeeds.buildDefaultBannerSeeds()) {
            String metadataJson = objectMapper.writeValueAsString(seed.metadata());
            jdbc.update("""
                    INSERT INTO campaign_banners(title, url, platform, cover_url, metadata, active)
                    SELECT ?, ?, ?, ?, ?::jsonb, true
                    WHERE NOT EXISTS (
                        SELECT 1 FROM campaign_banners WHERE url = ?
                    )
                    """,
                    seed.title(), seed.url(), seed.platform(), seed.coverUrl(), metadataJson, seed.url());
        }
    }
}
