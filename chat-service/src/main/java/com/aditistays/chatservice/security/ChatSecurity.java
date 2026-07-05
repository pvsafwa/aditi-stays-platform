package com.aditistays.chatservice.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.aditistays.chatservice.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

/**
 * Mirrors chat-service's Python app/core/security.py. Admin checks now decode
 * and validate the caller's Keycloak-issued JWT directly (rather than relying
 * on a path-based Spring Security rule) because admin-only actions here are
 * interleaved with per-lead user chat token access on the same /api/chat/**
 * paths (e.g. requireChatHttpAccess accepts either).
 */
@Component
@RequiredArgsConstructor
public class ChatSecurity {

    private static final String HMAC_ALGO = "HmacSHA256";

    private final AppProperties props;
    private final JwtDecoder jwtDecoder;

    public String extractBearer(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            return "";
        }
        String[] parts = authorization.trim().split(" ", 2);
        if (parts.length != 2 || !parts[0].equalsIgnoreCase("bearer")) {
            return "";
        }
        return parts[1].trim();
    }

    public String requireAdminHttp(HttpServletRequest request) {
        Jwt jwt = decodeAdminJwt(extractBearer(request.getHeader("Authorization")));
        if (jwt == null) {
            throw new ForbiddenException("invalid admin token");
        }
        return adminActor(jwt, request);
    }

    @SneakyThrows
    public boolean verifyUserChatToken(String token, long leadId) {
        if (token == null || token.isEmpty()) {
            return false;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return false;
        }
        String leadRaw = parts[0];
        String expRaw = parts[1];
        String signature = parts[2];
        if (signature.length() != 64) {
            return false;
        }

        long tokenLeadId;
        long exp;
        try {
            tokenLeadId = Long.parseLong(leadRaw);
            exp = Long.parseLong(expRaw);
        } catch (NumberFormatException e) {
            return false;
        }

        if (tokenLeadId != leadId) {
            return false;
        }
        if (exp <= Instant.now().getEpochSecond()) {
            return false;
        }

        String expectedSignature = signUserChatToken(leadId, exp, props.userChatTokenSecret());
        return constantTimeEquals(signature, expectedSignature);
    }

    @SneakyThrows
    private String signUserChatToken(long leadId, long exp, String secret) {
        String payload = leadId + "." + exp;
        Mac mac = Mac.getInstance(HMAC_ALGO);
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGO));
        byte[] sig = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(sig);
    }

    public boolean verifyAdminWsToken(String token) {
        if (token == null || token.isEmpty()) {
            return false;
        }
        return constantTimeEquals(token, props.adminChatToken());
    }

    public ChatAccess requireChatHttpAccess(long leadId, HttpServletRequest request) {
        String bearer = extractBearer(request.getHeader("Authorization"));
        Jwt jwt = decodeAdminJwt(bearer);
        if (jwt != null) {
            return new ChatAccess("admin", adminActor(jwt, request));
        }

        String xChatToken = request.getHeader("X-Chat-Token");
        String candidate = ((xChatToken != null && !xChatToken.isBlank()) ? xChatToken : bearer).trim();
        if (verifyUserChatToken(candidate, leadId)) {
            return new ChatAccess("user", "user");
        }

        throw new ForbiddenException("invalid chat token");
    }

    @SuppressWarnings("unchecked")
    private Jwt decodeAdminJwt(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        Jwt jwt;
        try {
            jwt = jwtDecoder.decode(token);
        } catch (JwtException e) {
            return null;
        }
        Object realmAccess = jwt.getClaimAsMap("realm_access");
        if (!(realmAccess instanceof Map<?, ?> map) || !(map.get("roles") instanceof List<?> roles)) {
            return null;
        }
        boolean authorized = roles.contains("admin") || roles.contains("service");
        return authorized ? jwt : null;
    }

    private static String adminActor(Jwt jwt, HttpServletRequest request) {
        String actorHeader = request.getHeader("X-Admin-Actor");
        String trimmed = actorHeader == null ? "" : actorHeader.trim();
        if (!trimmed.isEmpty()) {
            return trimmed;
        }
        String username = jwt.getClaimAsString("preferred_username");
        return (username == null || username.isEmpty()) ? "admin" : username;
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
