package com.aditistays.chatservice.filter;

import java.io.IOException;
import java.time.Duration;

import com.aditistays.chatservice.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(1)
public class RateLimitFilter extends OncePerRequestFilter implements Ordered {

    private final IpWindowRateLimiter limiter;

    public RateLimitFilter(AppProperties props) {
        this.limiter = new IpWindowRateLimiter(props.chatRateLimitPerMinute(), Duration.ofSeconds(60));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getRequestURI().endsWith("/health")) {
            chain.doFilter(request, response);
            return;
        }

        String key = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        IpWindowRateLimiter.Result result = limiter.allow(key);
        if (!result.allowed()) {
            response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"detail\":\"rate limit exceeded\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    @Override
    public int getOrder() {
        return 1;
    }
}
