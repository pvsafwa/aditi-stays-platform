package com.aditistays.catalogservice.model;

import java.time.Instant;
import java.util.Map;

import lombok.Data;

@Data
public class CampaignBanner {
    private long id;
    private String title;
    private String url;
    private String platform;
    private String coverUrl;
    private Map<String, Object> metadata;
    private boolean active;
    private Instant createdAt;
    private Instant updatedAt;
}
