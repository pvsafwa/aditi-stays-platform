package com.aditistays.chatservice.db;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Self-bootstraps every table and index chat-service depends on. Runs in
 * @PostConstruct so it completes before the embedded web server starts
 * accepting connections -- no external migration step required.
 *
 * chat_messages/payment_proofs.lead_id are NOT foreign keys here: leads live
 * in crm-service's own database now, so referential integrity for them is
 * enforced there instead (chat-service only ever writes rows for a lead_id
 * it was handed by an already-authenticated chat session).
 */
@Component
@RequiredArgsConstructor
public class SchemaInitializer {

    private final JdbcTemplate jdbc;

    @PostConstruct
    public void ensureSchema() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id BIGSERIAL PRIMARY KEY,
                    lead_id BIGINT NOT NULL,
                    sender_role TEXT NOT NULL,
                    sender_label TEXT NOT NULL,
                    message_type TEXT NOT NULL DEFAULT 'TEXT',
                    content TEXT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS payment_proofs (
                    id BIGSERIAL PRIMARY KEY,
                    lead_id BIGINT NOT NULL,
                    file_url TEXT NOT NULL,
                    uploaded_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_chat_messages_lead ON chat_messages(lead_id, created_at);
                """);
    }
}
