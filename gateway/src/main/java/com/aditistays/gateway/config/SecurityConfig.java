package com.aditistays.gateway.config;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Mono;

/**
 * Gateway-level defense in depth: /api/admin/** requires a valid
 * Keycloak-issued JWT carrying the "admin" or "service" realm role, same rule
 * each downstream service also enforces on its own. Everything else passes
 * through unauthenticated (services that need finer-grained/mixed auth, like
 * chat-service, still do their own checks).
 */
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .authorizeExchange(exchange -> exchange
                        // CORS preflight never carries the Authorization header --
                        // rejecting it here would fail the browser's preflight
                        // check before the real request (with the header) is ever sent.
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .pathMatchers("/api/admin/**").hasAnyRole("admin", "service")
                        .anyExchange().permitAll())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(realmRoleConverter())));
        return http.build();
    }

    private Converter<Jwt, Mono<AbstractAuthenticationToken>> realmRoleConverter() {
        return jwt -> Mono.just(new JwtAuthenticationToken(jwt, extractAuthorities(jwt)));
    }

    @SuppressWarnings("unchecked")
    private static Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null || !(realmAccess.get("roles") instanceof List<?> roles)) {
            return List.of();
        }
        return roles.stream()
                .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role))
                .collect(Collectors.toList());
    }
}
