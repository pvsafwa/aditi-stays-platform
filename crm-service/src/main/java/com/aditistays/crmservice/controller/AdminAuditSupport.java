package com.aditistays.crmservice.controller;

import java.util.Map;

import com.aditistays.crmservice.filter.RequestIdFilter;
import com.aditistays.crmservice.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AdminAuditSupport {

    private final AuditLogRepository auditLogRepository;

    public void record(HttpServletRequest request, String action, String resourceType, String resourceId, Map<String, Object> payload) {
        String actor = currentActor();
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

    private static String currentActor() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken jwtAuth) {
            String username = jwtAuth.getToken().getClaimAsString("preferred_username");
            if (username != null && !username.isEmpty()) {
                return username;
            }
        }
        return "admin";
    }
}
