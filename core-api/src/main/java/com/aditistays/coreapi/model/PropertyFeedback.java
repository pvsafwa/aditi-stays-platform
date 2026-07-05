package com.aditistays.coreapi.model;

import java.time.Instant;

import lombok.Data;

/** Shape is shared by both the "feedback" create response and the review-list entries. */
@Data
public class PropertyFeedback {
    private long id;
    private String propertyId;
    private String visitorId;
    private int rating;
    private String comment;
    private Instant createdAt;
}
