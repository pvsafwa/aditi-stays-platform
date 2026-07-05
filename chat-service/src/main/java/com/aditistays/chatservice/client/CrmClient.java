package com.aditistays.chatservice.client;

import java.util.Map;
import java.util.Optional;

import com.aditistays.chatservice.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Talks to crm-service over HTTP for the two things chat-service used to get
 * via a direct read/write against the (now separate) leads database: the
 * customer's name, and marking a lead confirmed. Authenticates as the
 * "internal-service" M2M client via a Keycloak-issued client-credentials
 * token (replaces the old shared ADMIN_API_TOKEN).
 */
@Component
public class CrmClient {

    private final RestClient restClient;

    /**
     * Takes Spring Boot's auto-configured RestClient.Builder bean (not the
     * static RestClient.builder() factory) so this client picks up the
     * ObservationRestClientCustomizer Boot wires in when Micrometer Tracing
     * is on the classpath -- that's what propagates the traceparent header
     * and creates a client span automatically, with zero code here.
     */
    public CrmClient(RestClient.Builder restClientBuilder, AppProperties props, ServiceTokenProvider tokenProvider) {
        this.restClient = restClientBuilder
                .baseUrl(props.crmServiceUrl())
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().setBearerAuth(tokenProvider.getAccessToken());
                    return execution.execute(request, body);
                })
                .defaultHeader("X-Admin-Actor", "chat-service")
                .build();
    }

    @SuppressWarnings("unchecked")
    public Optional<String> getCustomerName(long leadId) {
        try {
            Map<String, Object> body = restClient.get()
                    .uri("/api/admin/leads/{leadId}", leadId)
                    .retrieve()
                    .body(Map.class);
            Map<String, Object> lead = (Map<String, Object>) body.get("data");
            Object name = lead == null ? null : lead.get("customer_name");
            return Optional.ofNullable(name).map(String::valueOf);
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        }
    }

    public void confirmLead(long leadId, String details) {
        restClient.post()
                .uri("/api/admin/leads/{leadId}/confirm", leadId)
                .body(Map.of("details", details == null ? "" : details))
                .retrieve()
                .toBodilessEntity();
    }
}
