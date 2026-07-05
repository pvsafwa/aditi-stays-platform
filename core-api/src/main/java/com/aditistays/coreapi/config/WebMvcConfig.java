package com.aditistays.coreapi.config;

import com.aditistays.coreapi.filter.AdminAuthInterceptor;
import com.aditistays.coreapi.filter.LeadRateLimitInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AdminAuthInterceptor adminAuthInterceptor;
    private final LeadRateLimitInterceptor leadRateLimitInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminAuthInterceptor).addPathPatterns("/api/admin/**");
        registry.addInterceptor(leadRateLimitInterceptor).addPathPatterns("/api/leads/check-availability");
    }
}
