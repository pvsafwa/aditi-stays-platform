package com.aditistays.coreapi.dto;

import java.util.List;
import java.util.Map;

import lombok.Data;

/** Plain request-body shapes for endpoints that don't reuse a domain model 1:1. */
public final class Requests {

    private Requests() {
    }

    @Data
    public static class PropertyFeedbackRequest {
        private String visitorId;
        private int rating;
        private String comment;
    }

    @Data
    public static class BannerRequest {
        private String title;
        private String url;
        private String platform;
        private String coverUrl;
        private Map<String, Object> metadata;
    }

    @Data
    public static class TrackBrowsingRequest {
        private String visitorId;
        private String propertyId;
    }

    @Data
    public static class WishlistRequest {
        private String visitorId;
        private String propertyId;
    }

    @Data
    public static class ComparisonRequest {
        private List<String> propertyIds;
    }

    @Data
    public static class CheckAvailabilityRequest {
        private String visitorId;
        private String propertyId;
        private String customerName;
        private String mobileNumber;
        private boolean disclaimerAccepted;
    }

    @Data
    public static class InventoryCheckRequest {
        private boolean available;
        private String note;
    }

    @Data
    public static class PaymentRequest {
        private double amount;
        private String paymentType;
    }

    @Data
    public static class ConfirmLeadRequest {
        private String details;
    }
}
