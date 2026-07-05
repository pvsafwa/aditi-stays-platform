package com.aditistays.chatservice.repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ChatRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public void saveMessage(long leadId, String senderRole, String senderLabel, String messageType, String content, Map<String, Object> metadata) {
        String metadataJson = toJson(metadata);
        jdbc.update("""
                INSERT INTO chat_messages(lead_id, sender_role, sender_label, message_type, content, metadata)
                VALUES(?, ?, ?, ?, ?, ?::jsonb)
                """, leadId, senderRole, senderLabel, messageType, content, metadataJson);
    }

    public List<Map<String, Object>> fetchHistory(long leadId) {
        return jdbc.query("""
                SELECT sender_role, sender_label, message_type, content, metadata, created_at
                FROM chat_messages
                WHERE lead_id=?
                ORDER BY created_at ASC
                """, (rs, rowNum) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("event", "message");
            item.put("lead_id", leadId);
            item.put("sender_role", rs.getString("sender_role"));
            item.put("sender_label", rs.getString("sender_label"));
            item.put("message_type", rs.getString("message_type"));
            item.put("content", rs.getString("content"));
            item.put("metadata", parseMetadata(rs.getString("metadata")));
            item.put("created_at", rs.getTimestamp("created_at").toInstant().toString());
            return item;
        }, leadId);
    }

    public Optional<String> getCustomerName(long leadId) {
        try {
            String name = jdbc.queryForObject("SELECT customer_name FROM leads WHERE id=?", String.class, leadId);
            return Optional.ofNullable(name);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public void savePaymentProof(long leadId, String fileUrl, String uploadedBy) {
        jdbc.update("""
                INSERT INTO payment_proofs(lead_id, file_url, uploaded_by)
                VALUES(?, ?, ?)
                """, leadId, fileUrl, uploadedBy);
    }

    public void confirmLead(long leadId, String details) {
        jdbc.update("""
                UPDATE leads
                SET status='CONFIRMED', admin_notes=?, updated_at=NOW()
                WHERE id=?
                """, details, leadId);
    }

    @SneakyThrows
    private String toJson(Map<String, Object> value) {
        return objectMapper.writeValueAsString(value == null ? Map.of() : value);
    }

    @SneakyThrows
    private Map<String, Object> parseMetadata(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<String, Object> parsed = objectMapper.readValue(raw, Map.class);
        return parsed == null ? Map.of() : parsed;
    }
}
