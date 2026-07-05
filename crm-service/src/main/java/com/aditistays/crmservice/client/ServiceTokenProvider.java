package com.aditistays.crmservice.client;

import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.stereotype.Component;

/**
 * Fetches (and transparently caches/refreshes, via the authorized client
 * manager) the client-credentials access token for the "internal-service"
 * Keycloak client, used to authenticate this service's outbound calls to
 * other services' /api/admin/** endpoints.
 */
@Component
@RequiredArgsConstructor
public class ServiceTokenProvider {

    private static final Authentication SERVICE_PRINCIPAL = new AnonymousAuthenticationToken(
            "internal-service-key", "internal-service", AuthorityUtils.createAuthorityList("ROLE_SERVICE"));

    private final OAuth2AuthorizedClientManager authorizedClientManager;

    public String getAccessToken() {
        OAuth2AuthorizeRequest authorizeRequest = OAuth2AuthorizeRequest
                .withClientRegistrationId("internal-service")
                .principal(SERVICE_PRINCIPAL)
                .build();
        OAuth2AuthorizedClient authorizedClient = authorizedClientManager.authorize(authorizeRequest);
        if (authorizedClient == null) {
            throw new IllegalStateException("failed to obtain internal-service access token");
        }
        return authorizedClient.getAccessToken().getTokenValue();
    }
}
