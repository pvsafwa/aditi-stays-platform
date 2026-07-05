package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.filter.AdminAuthInterceptor;
import com.aditistays.coreapi.filter.RequestIdFilter;
import com.aditistays.coreapi.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AdminAuditSupport {

    private final AuditLogRepository auditLogRepository;

    public void record(HttpServletRequest request, String action, String resourceType, String resourceId, Map<String, Object> payload) {
        Object actorAttr = request.getAttribute(AdminAuthInterceptor.ADMIN_ACTOR_ATTRIBUTE);
        String actor = actorAttr instanceof String s && !s.isEmpty() ? s : "admin";
        Object requestIdAttr = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        String requestId = requestIdAttr instanceof String s ? s : null;

        try {
            auditLogRepository.createAuditLog(
                    actor, "admin", action, resourceType, resourceId, requestId,
                    request.getRemoteAddr(), request.getHeader("User-Agent"), payload);
        } catch (Exception e) {
            System.err.printf("audit log failed: %s%n", e.getMessage());
        }
    }
}
