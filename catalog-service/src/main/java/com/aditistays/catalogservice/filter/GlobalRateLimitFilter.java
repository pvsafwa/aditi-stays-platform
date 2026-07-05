package com.aditistays.catalogservice.filter;

import java.io.IOException;
import java.time.Duration;

import com.aditistays.catalogservice.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(4)
public class GlobalRateLimitFilter extends OncePerRequestFilter implements Ordered {

    private final IpWindowRateLimiter limiter;

    public GlobalRateLimitFilter(AppProperties props) {
        this.limiter = new IpWindowRateLimiter(props.globalRateLimitPerMinute(), Duration.ofMinutes(1));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        IpWindowRateLimiter.Result result = limiter.allow(request.getRemoteAddr());
        if (!result.allowed()) {
            response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"rate limit exceeded\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    @Override
    public int getOrder() {
        return 4;
    }
}
