package com.aditistays.crmservice.repository;

import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class AuditLogRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @SneakyThrows
    public void createAuditLog(
            String actor,
            String actorRole,
            String action,
            String resourceType,
            String resourceId,
            String requestId,
            String ipAddress,
            String userAgent,
            Map<String, Object> payload
    ) {
        String effectiveActor = (actor == null || actor.isEmpty()) ? "admin" : actor;
        String effectiveActorRole = (actorRole == null || actorRole.isEmpty()) ? "admin" : actorRole;
        Map<String, Object> effectivePayload = payload == null ? Map.of() : payload;
        String payloadJson = objectMapper.writeValueAsString(effectivePayload);

        jdbc.update("""
                INSERT INTO audit_logs(
                    actor, actor_role, action, resource_type, resource_id, request_id, ip_address, user_agent, payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)""",
                effectiveActor, effectiveActorRole, action, resourceType, resourceId, requestId, ipAddress, userAgent, payloadJson);
    }
}
