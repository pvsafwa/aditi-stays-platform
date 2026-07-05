package com.aditistays.coreapi.model;

import java.util.List;

import lombok.Data;

@Data
public class PropertyCreateInput {
    private String id;
    private String location;
    private double nightlyPrice;
    private boolean familyFriendly;
    private List<String> amenities;
    private String heroImage;
    private List<String> media;
    private String description;
}
