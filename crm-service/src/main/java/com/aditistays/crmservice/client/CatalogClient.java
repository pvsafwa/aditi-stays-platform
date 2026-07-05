package com.aditistays.crmservice.client;

import java.util.List;
import java.util.Map;

import com.aditistays.crmservice.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Talks to catalog-service over HTTP for the two things crm-service used to
 * get via a direct join against the (now separate) properties database:
 * validating a property exists, and pulling a visitor's browsing
 * history/wishlist for the admin lead-context view.
 */
@Component
public class CatalogClient {

    private final RestClient restClient;

    /**
     * Takes Spring Boot's auto-configured RestClient.Builder bean (not the
     * static RestClient.builder() factory) so this client picks up the
     * ObservationRestClientCustomizer Boot wires in when Micrometer Tracing
     * is on the classpath -- that's what propagates the traceparent header
     * and creates a client span automatically, with zero code here.
     */
    public CatalogClient(RestClient.Builder restClientBuilder, AppProperties props) {
        this.restClient = restClientBuilder.baseUrl(props.catalogServiceUrl()).build();
    }

    public boolean propertyExists(String propertyId) {
        try {
            restClient.get().uri("/api/properties/{id}", propertyId).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getBrowsingHistory(String visitorId) {
        Map<String, Object> body = restClient.get()
                .uri("/api/browsing-history/{visitorId}", visitorId)
                .retrieve()
                .body(Map.class);
        return (List<Map<String, Object>>) body.get("data");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getWishlist(String visitorId) {
        Map<String, Object> body = restClient.get()
                .uri("/api/wishlist/{visitorId}", visitorId)
                .retrieve()
                .body(Map.class);
        return (List<Map<String, Object>>) body.get("data");
    }
}
