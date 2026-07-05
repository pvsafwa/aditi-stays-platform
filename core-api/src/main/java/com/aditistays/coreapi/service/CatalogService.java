package com.aditistays.coreapi.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.aditistays.coreapi.model.Property;
import com.aditistays.coreapi.model.PropertyCreateInput;
import com.aditistays.coreapi.repository.PropertyRepository;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {

    private static final List<String> BANNED_TERMS = List.of(
            "alcohol", "beer", "wine", "gambling", "casino", "dj", "music party", "nightclub", "riba", "interest", "bank"
    );

    private final PropertyRepository propertyRepository;

    public CatalogService(PropertyRepository propertyRepository) {
        this.propertyRepository = propertyRepository;
    }

    public List<Property> listProperties() {
        List<Property> clean = new ArrayList<>();
        for (Property p : propertyRepository.listProperties()) {
            if (isPropertyHalalCompliant(p)) {
                p.setPublicTitle(p.getId()); // hard shield: always expose masked id
                clean.add(p);
            }
        }
        return clean;
    }

    public Property getPropertyById(String id) {
        Property p = propertyRepository.getPropertyById(id);
        if (!isPropertyHalalCompliant(p)) {
            throw new NotFoundException("property violates halal policy");
        }
        p.setPublicTitle(p.getId());
        return p;
    }

    public Property createProperty(PropertyCreateInput in) {
        if (!in.isFamilyFriendly()) {
            throw new BadRequestException("family_friendly must be true");
        }
        assertHalalCompliantCandidate(in.getId(), in);

        Property row = propertyRepository.createProperty(in);
        row.setPublicTitle(row.getId());
        return row;
    }

    public Property updateProperty(String id, PropertyCreateInput in) {
        if (!in.isFamilyFriendly()) {
            throw new BadRequestException("family_friendly must be true");
        }
        assertHalalCompliantCandidate(id, in);

        Property row = propertyRepository.updateProperty(id, in);
        row.setPublicTitle(row.getId());
        return row;
    }

    private void assertHalalCompliantCandidate(String id, PropertyCreateInput in) {
        Property candidate = new Property();
        candidate.setId(id == null ? "" : id.trim());
        candidate.setPublicTitle(candidate.getId());
        candidate.setLocation(in.getLocation() == null ? "" : in.getLocation().trim());
        candidate.setNightlyPrice(in.getNightlyPrice());
        candidate.setFamilyFriendly(in.isFamilyFriendly());
        candidate.setAmenities(in.getAmenities());
        candidate.setHeroImage(in.getHeroImage() == null ? "" : in.getHeroImage().trim());
        candidate.setMedia(in.getMedia());
        candidate.setDescription(in.getDescription() == null ? "" : in.getDescription().trim());
        if (!isPropertyHalalCompliant(candidate)) {
            throw new BadRequestException("property violates family policy");
        }
    }

    public List<Property> compareProperties(List<String> ids) {
        List<Property> result = new ArrayList<>();
        for (Property p : propertyRepository.getPropertiesByIds(ids)) {
            if (isPropertyHalalCompliant(p)) {
                p.setPublicTitle(p.getId());
                result.add(p);
            }
        }
        return result;
    }

    private static boolean isPropertyHalalCompliant(Property p) {
        for (String term : BANNED_TERMS) {
            String needle = term.toLowerCase(Locale.ROOT);
            if (p.getDescription() != null && p.getDescription().toLowerCase(Locale.ROOT).contains(needle)) {
                return false;
            }
            if (p.getAmenities() != null) {
                for (String amenity : p.getAmenities()) {
                    if (amenity != null && amenity.toLowerCase(Locale.ROOT).contains(needle)) {
                        return false;
                    }
                }
            }
        }
        return p.isFamilyFriendly();
    }

    public static void validateLeadInput(String visitorId, String propertyId, String customerName, String mobile, boolean disclaimerAccepted) {
        if (isBlank(visitorId) || isBlank(propertyId) || isBlank(customerName) || isBlank(mobile)) {
            throw new BadRequestException("visitor_id, property_id, customer_name and mobile_number are required");
        }
        if (!disclaimerAccepted) {
            throw new BadRequestException("compliance disclaimer must be accepted");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }
}
