package com.aditistays.crmservice.filter;

import java.time.Duration;

import com.aditistays.crmservice.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class LeadRateLimitInterceptor implements HandlerInterceptor {

    private final IpWindowRateLimiter limiter;

    public LeadRateLimitInterceptor(AppProperties props) {
        this.limiter = new IpWindowRateLimiter(props.leadRateLimitPerMinute(), Duration.ofMinutes(1));
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        IpWindowRateLimiter.Result result = limiter.allow(request.getRemoteAddr());
        if (!result.allowed()) {
            response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"rate limit exceeded\"}");
            return false;
        }
        return true;
    }
}
