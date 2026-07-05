package com.aditistays.crmservice.model;

import java.time.Instant;

import lombok.Data;

@Data
public class Payment {
    private long id;
    private long leadId;
    private double amount;
    private String paymentType;
    private String source;
    private Instant createdAt;
}
