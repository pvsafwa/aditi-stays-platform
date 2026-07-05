package com.aditistays.coreapi.filter;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

import com.aditistays.coreapi.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(3)
public class CorsSecurityFilter extends OncePerRequestFilter implements Ordered {

    private final boolean allowAll;
    private final Set<String> allowed;

    public CorsSecurityFilter(AppProperties props) {
        Set<String> set = new HashSet<>();
        boolean wildcard = false;
        for (String origin : props.corsAllowedOrigins()) {
            String trimmed = origin.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.equals("*")) {
                wildcard = true;
            }
            set.add(trimmed);
        }
        this.allowAll = wildcard;
        this.allowed = set;
    }

    private boolean originAllowed(String origin) {
        return origin.isEmpty() || allowAll || allowed.contains(origin);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        origin = origin == null ? "" : origin;
        if (!origin.isEmpty()) {
            response.addHeader("Vary", "Origin");
        }

        if (!originAllowed(origin)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"origin is not allowed\"}");
            return;
        }

        if (!origin.isEmpty()) {
            if (allowAll) {
                response.setHeader("Access-Control-Allow-Origin", "*");
            } else {
                response.setHeader("Access-Control-Allow-Origin", origin);
                response.setHeader("Access-Control-Allow-Credentials", "true");
            }
        }
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Actor, X-Request-ID");
        response.setHeader("Access-Control-Expose-Headers", "X-Request-ID");

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        chain.doFilter(request, response);
    }

    @Override
    public int getOrder() {
        return 3;
    }
}
