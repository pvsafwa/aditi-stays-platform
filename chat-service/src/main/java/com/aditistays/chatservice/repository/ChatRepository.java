package com.aditistays.chatservice.repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
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

    public void savePaymentProof(long leadId, String fileUrl, String uploadedBy) {
        jdbc.update("""
                INSERT INTO payment_proofs(lead_id, file_url, uploaded_by)
                VALUES(?, ?, ?)
                """, leadId, fileUrl, uploadedBy);
    }

    /** One row per lead_id: its most recent chat message, for crm-service's admin leads list preview. */
    public Map<Long, Map<String, Object>> getLastMessages(List<Long> leadIds) {
        if (leadIds == null || leadIds.isEmpty()) {
            return Map.of();
        }
        List<Map<String, Object>> rows = jdbc.query(con -> {
            var ps = con.prepareStatement("""
                    SELECT DISTINCT ON (lead_id) lead_id, sender_role, content, created_at
                    FROM chat_messages
                    WHERE lead_id = ANY(?::bigint[])
                    ORDER BY lead_id, created_at DESC
                    """);
            ps.setArray(1, con.createArrayOf("bigint", leadIds.toArray()));
            return ps;
        }, (rs, rowNum) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("lead_id", rs.getLong("lead_id"));
            m.put("sender_role", rs.getString("sender_role"));
            m.put("content", rs.getString("content"));
            m.put("created_at", rs.getTimestamp("created_at").toInstant().toString());
            return m;
        });

        Map<Long, Map<String, Object>> byLeadId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            byLeadId.put((Long) row.get("lead_id"), row);
        }
        return byLeadId;
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
