package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.dto.Requests.WishlistRequest;
import com.aditistays.coreapi.repository.PropertyRepository;
import com.aditistays.coreapi.service.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wishlist")
@RequiredArgsConstructor
public class WishlistController {

    private final PropertyRepository propertyRepository;

    @PostMapping("/items")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addWishlistItem(@RequestBody WishlistRequest in) {
        if (isBlank(in.getVisitorId()) || isBlank(in.getPropertyId())) {
            throw new BadRequestException("visitor_id and property_id are required");
        }
        propertyRepository.addWishlistItem(in.getVisitorId(), in.getPropertyId());
        return Map.of("ok", true);
    }

    @DeleteMapping("/items")
    public Map<String, Object> removeWishlistItem(@RequestParam("visitor_id") String visitorId,
                                                    @RequestParam("property_id") String propertyId) {
        if (isBlank(visitorId) || isBlank(propertyId)) {
            throw new BadRequestException("visitor_id and property_id are required query params");
        }
        propertyRepository.removeWishlistItem(visitorId, propertyId);
        return Map.of("ok", true);
    }

    @GetMapping("/{visitorId}")
    public Map<String, Object> getWishlist(@PathVariable String visitorId) {
        return Map.of("data", propertyRepository.getWishlist(visitorId));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }
}
