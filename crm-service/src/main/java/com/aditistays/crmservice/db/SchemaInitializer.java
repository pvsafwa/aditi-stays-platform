package com.aditistays.crmservice.db;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Self-bootstraps every table and index crm-service depends on. Runs in
 * @PostConstruct so it completes before the embedded web server starts
 * accepting connections -- no external migration step required.
 *
 * leads.property_id is NOT a foreign key here: properties live in
 * catalog-service's own database now, so referential integrity for it is
 * enforced by a synchronous validation call to catalog-service instead
 * (see LeadService.createOrReuseLead).
 */
@Component
@RequiredArgsConstructor
public class SchemaInitializer {

    private final JdbcTemplate jdbc;

    @PostConstruct
    public void ensureSchema() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS leads (
                    id BIGSERIAL PRIMARY KEY,
                    visitor_id TEXT NOT NULL,
                    property_id TEXT NOT NULL,
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
                CREATE TABLE IF NOT EXISTS outbox_events (
                    id BIGSERIAL PRIMARY KEY,
                    aggregate_type TEXT NOT NULL,
                    aggregate_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    published_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
                CREATE INDEX IF NOT EXISTS idx_leads_visitor ON leads(visitor_id);
                CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished ON outbox_events(id) WHERE published_at IS NULL;
                """);
    }
}
