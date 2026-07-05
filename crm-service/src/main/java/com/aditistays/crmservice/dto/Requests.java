package com.aditistays.crmservice.dto;

import lombok.Data;

/** Plain request-body shapes for endpoints that don't reuse a domain model 1:1. */
public final class Requests {

    private Requests() {
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
