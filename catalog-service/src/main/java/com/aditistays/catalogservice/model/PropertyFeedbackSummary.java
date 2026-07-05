package com.aditistays.catalogservice.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyFeedbackSummary {
    private String propertyId;
    private double avgRating;
    private long reviewCount;
}
