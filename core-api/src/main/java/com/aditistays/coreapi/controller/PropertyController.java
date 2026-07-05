package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.dto.Requests.PropertyFeedbackRequest;
import com.aditistays.coreapi.model.Property;
import com.aditistays.coreapi.model.PropertyFeedback;
import com.aditistays.coreapi.repository.PropertyRepository;
import com.aditistays.coreapi.service.BadRequestException;
import com.aditistays.coreapi.service.CatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/properties")
@RequiredArgsConstructor
public class PropertyController {

    private final CatalogService catalogService;
    private final PropertyRepository propertyRepository;

    @GetMapping
    public Map<String, Object> listProperties() {
        return Map.of("data", catalogService.listProperties());
    }

    @GetMapping("/feedback-summary")
    public Map<String, Object> getPropertyFeedbackSummary() {
        return Map.of("data", propertyRepository.getPropertyFeedbackSummary());
    }

    @GetMapping("/{id}")
    public Map<String, Object> getProperty(@PathVariable String id) {
        Property prop = catalogService.getPropertyById(id);
        return Map.of("data", prop);
    }

    @GetMapping("/{id}/feedback")
    public Map<String, Object> getPropertyReviews(@PathVariable String id) {
        var summary = propertyRepository.getPropertyFeedbackSummaryById(id);
        var reviews = propertyRepository.listPropertyReviews(id, 50);
        return Map.of("data", reviews, "summary", summary);
    }

    @PostMapping("/{id}/feedback")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addPropertyFeedback(@PathVariable String id, @RequestBody PropertyFeedbackRequest in) {
        if (id == null || id.isEmpty()) {
            throw new BadRequestException("property id is required");
        }
        if (in.getVisitorId() == null || in.getVisitorId().isEmpty()) {
            throw new BadRequestException("visitor_id is required");
        }
        if (in.getRating() < 1 || in.getRating() > 5) {
            throw new BadRequestException("rating must be between 1 and 5");
        }
        PropertyFeedback row = propertyRepository.addPropertyFeedback(id, in.getVisitorId(), in.getRating(), in.getComment());
        return Map.of("data", row);
    }
}
