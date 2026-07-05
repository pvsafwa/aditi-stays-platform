package com.aditistays.chatservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * chat-service enforces admin-vs-user access per endpoint in ChatSecurity
 * (some /api/chat/** endpoints accept either an admin JWT or a per-lead user
 * chat token), so this filter chain stays permissive at the gate and exists
 * mainly to (a) provide the JwtDecoder bean ChatSecurity uses to validate
 * bearer tokens, and (b) stop Spring Boot's default security auto-config
 * from locking every endpoint behind basic auth.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));
        return http.build();
    }
}
