package com.aditistays.coreapi.filter;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import com.aditistays.coreapi.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String ADMIN_ACTOR_ATTRIBUTE = "admin_actor";

    private final String requiredToken;

    public AdminAuthInterceptor(AppProperties props) {
        this.requiredToken = props.adminApiToken();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String authHeader = request.getHeader("Authorization");
        String trimmed = authHeader == null ? "" : authHeader.trim();
        String[] parts = trimmed.split(" ", 2);
        if (parts.length != 2 || !parts[0].equalsIgnoreCase("Bearer")) {
            respondJson(response, HttpServletResponse.SC_UNAUTHORIZED, "missing admin bearer token");
            return false;
        }
        String token = parts[1].trim();
        if (!constantTimeEquals(token, requiredToken)) {
            respondJson(response, HttpServletResponse.SC_FORBIDDEN, "invalid admin token");
            return false;
        }

        String actor = request.getHeader("X-Admin-Actor");
        actor = (actor == null || actor.trim().isEmpty()) ? "admin" : actor.trim();
        request.setAttribute(ADMIN_ACTOR_ATTRIBUTE, actor);
        return true;
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static void respondJson(HttpServletResponse response, int status, String error) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + error + "\"}");
    }
}
