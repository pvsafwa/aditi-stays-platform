package com.aditistays.crmservice.outbox;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class OutboxRepository {

    private final JdbcTemplate jdbc;

    /** Must be called within the same transaction as the business write it accompanies. */
    public void insert(String aggregateType, String aggregateId, String eventType, String payloadJson) {
        jdbc.update("""
                INSERT INTO outbox_events(aggregate_type, aggregate_id, event_type, payload)
                VALUES (?, ?, ?, ?::jsonb)
                """, aggregateType, aggregateId, eventType, payloadJson);
    }

    public List<OutboxEvent> fetchUnpublished(int batchSize) {
        return jdbc.query("""
                SELECT id, payload::text AS payload
                FROM outbox_events
                WHERE published_at IS NULL
                ORDER BY id ASC
                LIMIT ?
                """, (rs, rowNum) -> new OutboxEvent(rs.getLong("id"), rs.getString("payload")), batchSize);
    }

    public void markPublished(long id) {
        jdbc.update("UPDATE outbox_events SET published_at = NOW() WHERE id = ?", id);
    }
}
