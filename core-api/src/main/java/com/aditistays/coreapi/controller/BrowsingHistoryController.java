package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.dto.Requests.TrackBrowsingRequest;
import com.aditistays.coreapi.repository.PropertyRepository;
import com.aditistays.coreapi.service.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/browsing-history")
@RequiredArgsConstructor
public class BrowsingHistoryController {

    private final PropertyRepository propertyRepository;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> trackBrowsing(@RequestBody TrackBrowsingRequest in) {
        if (isBlank(in.getVisitorId()) || isBlank(in.getPropertyId())) {
            throw new BadRequestException("visitor_id and property_id are required");
        }
        propertyRepository.addBrowsingHistory(in.getVisitorId(), in.getPropertyId());
        return Map.of("ok", true);
    }

    @GetMapping("/{visitorId}")
    public Map<String, Object> getBrowsing(@PathVariable String visitorId) {
        return Map.of("data", propertyRepository.getBrowsingHistory(visitorId, 50));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }
}
