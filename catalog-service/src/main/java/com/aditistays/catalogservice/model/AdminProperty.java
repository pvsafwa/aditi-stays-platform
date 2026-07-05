package com.aditistays.catalogservice.model;

import java.time.Instant;
import java.util.List;

import lombok.Data;

@Data
public class AdminProperty {
    private String id;
    private String publicTitle;
    private String location;
    private double nightlyPrice;
    private boolean familyFriendly;
    private List<String> amenities;
    private String heroImage;
    private List<String> media;
    private String description;
    private boolean active;
    private Instant createdAt;
}
