package com.aditistays.crmservice.client;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.aditistays.crmservice.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Talks to chat-service over HTTP for the two things crm-service used to get
 * via a direct read against the (now separate) chat_messages database: a
 * lead's full message history, and the last message per lead for the admin
 * leads-list preview. Authenticates as the "internal-service" M2M client via
 * a Keycloak-issued client-credentials token (replaces the old shared
 * ADMIN_API_TOKEN).
 */
@Component
public class ChatClient {

    private final RestClient restClient;

    /**
     * Takes Spring Boot's auto-configured RestClient.Builder bean (not the
     * static RestClient.builder() factory) so this client picks up the
     * ObservationRestClientCustomizer Boot wires in when Micrometer Tracing
     * is on the classpath -- that's what propagates the traceparent header
     * and creates a client span automatically, with zero code here.
     */
    public ChatClient(RestClient.Builder restClientBuilder, AppProperties props, ServiceTokenProvider tokenProvider) {
        this.restClient = restClientBuilder
                .baseUrl(props.chatServiceUrl())
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().setBearerAuth(tokenProvider.getAccessToken());
                    return execution.execute(request, body);
                })
                .defaultHeader("X-Admin-Actor", "crm-service")
                .build();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getMessages(long leadId) {
        Map<String, Object> body = restClient.get()
                .uri("/api/chat/{leadId}/messages", leadId)
                .retrieve()
                .body(Map.class);
        return (List<Map<String, Object>>) body.get("data");
    }

    @SuppressWarnings("unchecked")
    public Map<String, Map<String, Object>> getLastMessages(List<Long> leadIds) {
        if (leadIds.isEmpty()) {
            return Map.of();
        }
        String csv = leadIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        Map<String, Object> body = restClient.get()
                .uri("/api/admin/chat/last-messages?leadIds={csv}", csv)
                .retrieve()
                .body(Map.class);
        return (Map<String, Map<String, Object>>) body.get("data");
    }
}
