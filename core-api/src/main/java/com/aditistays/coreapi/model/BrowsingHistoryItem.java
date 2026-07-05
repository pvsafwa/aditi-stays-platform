package com.aditistays.coreapi.model;

import java.time.Instant;

import lombok.Data;

@Data
public class BrowsingHistoryItem {
    private String propertyId;
    private Instant viewedAt;
}
