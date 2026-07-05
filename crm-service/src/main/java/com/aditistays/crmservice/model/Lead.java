package com.aditistays.crmservice.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
public class Lead {
    private long id;
    private String visitorId;
    private String propertyId;
    private String customerName;
    private String mobileNumber;
    private String status;
    private boolean disclaimerAccepted;
    private boolean inventoryChecked;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String adminNotes;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String lastMessage;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String lastSenderRole;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Instant lastMessageAt;
    private Instant createdAt;
    private Instant updatedAt;
}
