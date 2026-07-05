package com.aditistays.coreapi.filter;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component
@Order(5)
@RequiredArgsConstructor
public class MetricsFilter extends OncePerRequestFilter implements Ordered {

    private final MetricsCollector metrics;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long started = System.currentTimeMillis();
        chain.doFilter(request, response);
        long latency = System.currentTimeMillis() - started;

        Object matchedPattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String route = matchedPattern != null ? matchedPattern.toString() : request.getRequestURI();
        metrics.record(response.getStatus(), route, latency);
    }

    @Override
    public int getOrder() {
        return 5;
    }
}
