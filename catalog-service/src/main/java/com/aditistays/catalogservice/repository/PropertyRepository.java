package com.aditistays.catalogservice.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import com.aditistays.catalogservice.model.AdminProperty;
import com.aditistays.catalogservice.model.BrowsingHistoryItem;
import com.aditistays.catalogservice.model.Property;
import com.aditistays.catalogservice.model.PropertyCreateInput;
import com.aditistays.catalogservice.model.PropertyFeedback;
import com.aditistays.catalogservice.model.PropertyFeedbackSummary;
import com.aditistays.catalogservice.service.BadRequestException;
import com.aditistays.catalogservice.service.ConflictException;
import com.aditistays.catalogservice.service.NotFoundException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PropertyRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    private final RowMapper<Property> propertyMapper = (rs, rowNum) -> {
        Property p = new Property();
        p.setId(rs.getString("id"));
        p.setPublicTitle(rs.getString("public_title"));
        p.setLocation(rs.getString("location"));
        p.setNightlyPrice(rs.getDouble("nightly_price"));
        p.setFamilyFriendly(rs.getBoolean("family_friendly"));
        p.setAmenities(readStringList(rs, "amenities"));
        p.setHeroImage(rs.getString("hero_image"));
        p.setMedia(readStringList(rs, "media"));
        p.setDescription(rs.getString("description"));
        p.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        return p;
    };

    private final RowMapper<AdminProperty> adminPropertyMapper = (rs, rowNum) -> {
        AdminProperty p = new AdminProperty();
        p.setId(rs.getString("id"));
        p.setPublicTitle(rs.getString("public_title"));
        p.setLocation(rs.getString("location"));
        p.setNightlyPrice(rs.getDouble("nightly_price"));
        p.setFamilyFriendly(rs.getBoolean("family_friendly"));
        p.setAmenities(readStringList(rs, "amenities"));
        p.setHeroImage(rs.getString("hero_image"));
        p.setMedia(readStringList(rs, "media"));
        p.setDescription(rs.getString("description"));
        p.setActive(rs.getBoolean("active"));
        p.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        return p;
    };

    @SneakyThrows
    private List<String> readStringList(ResultSet rs, String column) throws SQLException {
        String raw = rs.getString(column);
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return objectMapper.readValue(raw, new TypeReference<List<String>>() {
        });
    }

    public List<Property> listProperties() {
        return jdbc.query("""
                SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
                FROM properties
                WHERE active = true
                ORDER BY created_at DESC""", propertyMapper);
    }

    public Property getPropertyById(String id) {
        try {
            return jdbc.queryForObject("""
                    SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
                    FROM properties
                    WHERE id=? AND active=true""", propertyMapper, id);
        } catch (EmptyResultDataAccessException e) {
            throw new NotFoundException("property not found");
        }
    }

    public List<AdminProperty> listAdminProperties() {
        return jdbc.query("""
                SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active, created_at
                FROM properties
                ORDER BY created_at DESC""", adminPropertyMapper);
    }

    @SneakyThrows
    public Property createProperty(PropertyCreateInput in) {
        Normalized n = normalize(in.getId(), in);

        String amenitiesJson = objectMapper.writeValueAsString(n.amenities());
        String mediaJson = objectMapper.writeValueAsString(n.media());

        try {
            return jdbc.queryForObject("""
                    INSERT INTO properties(id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, active)
                    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?, true)
                    RETURNING id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
                    """, propertyMapper,
                    n.id(), n.id(), n.location(), n.nightlyPrice(), in.isFamilyFriendly(),
                    amenitiesJson, n.heroImage(), mediaJson, n.description());
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new com.aditistays.catalogservice.service.DuplicateException("property id already exists");
        }
    }

    @SneakyThrows
    public Property updateProperty(String id, PropertyCreateInput in) {
        Normalized n = normalize(id, in);
        String amenitiesJson = objectMapper.writeValueAsString(n.amenities());
        String mediaJson = objectMapper.writeValueAsString(n.media());

        try {
            return jdbc.queryForObject("""
                    UPDATE properties
                    SET
                        location=?,
                        nightly_price=?,
                        family_friendly=?,
                        amenities=?::jsonb,
                        hero_image=?,
                        media=?::jsonb,
                        description=?,
                        active=true
                    WHERE id=?
                    RETURNING id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
                    """, propertyMapper,
                    n.location(), n.nightlyPrice(), in.isFamilyFriendly(), amenitiesJson,
                    n.heroImage(), mediaJson, n.description(), id);
        } catch (EmptyResultDataAccessException e) {
            throw new NotFoundException("property not found");
        }
    }

    private record Normalized(String id, String location, String heroImage, String description,
                               List<String> amenities, List<String> media, double nightlyPrice) {
    }

    private Normalized normalize(String id, PropertyCreateInput in) {
        String trimmedId = id == null ? "" : id.trim();
        String location = in.getLocation() == null ? "" : in.getLocation().trim();
        String heroImage = in.getHeroImage() == null ? "" : in.getHeroImage().trim();
        String description = in.getDescription() == null ? "" : in.getDescription().trim();

        if (trimmedId.isEmpty()) {
            throw new BadRequestException("id is required");
        }
        if (location.isEmpty()) {
            throw new BadRequestException("location is required");
        }
        if (in.getNightlyPrice() <= 0) {
            throw new BadRequestException("nightly_price must be greater than zero");
        }
        if (heroImage.isEmpty()) {
            throw new BadRequestException("hero_image is required");
        }
        if (description.isEmpty()) {
            throw new BadRequestException("description is required");
        }

        List<String> amenities = in.getAmenities() == null ? List.of() : in.getAmenities();
        if (amenities.isEmpty()) {
            throw new BadRequestException("amenities must have at least one value");
        }
        List<String> normalizedAmenities = new ArrayList<>();
        for (String a : amenities) {
            if (a != null && !a.trim().isEmpty()) {
                normalizedAmenities.add(a.trim());
            }
        }
        if (normalizedAmenities.isEmpty()) {
            throw new BadRequestException("amenities must have at least one non-empty value");
        }

        List<String> media = in.getMedia() == null ? List.of() : in.getMedia();
        List<String> normalizedMedia = new ArrayList<>();
        for (String m : media) {
            if (m != null && !m.trim().isEmpty()) {
                normalizedMedia.add(m.trim());
            }
        }
        if (normalizedMedia.isEmpty()) {
            normalizedMedia = List.of(heroImage);
        }

        return new Normalized(trimmedId, location, heroImage, description, normalizedAmenities, normalizedMedia, in.getNightlyPrice());
    }

    public void deactivateProperty(String id) {
        int rows = jdbc.update("UPDATE properties SET active=false WHERE id=?", id);
        if (rows == 0) {
            throw new NotFoundException("property not found");
        }
    }

    public void addBrowsingHistory(String visitorId, String propertyId) {
        jdbc.update("INSERT INTO browsing_history(visitor_id, property_id) VALUES (?, ?)", visitorId, propertyId);
    }

    public List<BrowsingHistoryItem> getBrowsingHistory(String visitorId, int limit) {
        return jdbc.query("""
                SELECT property_id, viewed_at
                FROM browsing_history
                WHERE visitor_id=?
                ORDER BY viewed_at DESC
                LIMIT ?""", (rs, rowNum) -> {
            BrowsingHistoryItem item = new BrowsingHistoryItem();
            item.setPropertyId(rs.getString("property_id"));
            item.setViewedAt(rs.getTimestamp("viewed_at").toInstant());
            return item;
        }, visitorId, limit);
    }

    public void addWishlistItem(String visitorId, String propertyId) {
        jdbc.update("""
                INSERT INTO wishlist_items(visitor_id, property_id)
                VALUES (?, ?)
                ON CONFLICT(visitor_id, property_id) DO NOTHING""", visitorId, propertyId);
    }

    public void removeWishlistItem(String visitorId, String propertyId) {
        jdbc.update("DELETE FROM wishlist_items WHERE visitor_id=? AND property_id=?", visitorId, propertyId);
    }

    public List<Property> getWishlist(String visitorId) {
        return jdbc.query("""
                SELECT p.id, p.public_title, p.location, p.nightly_price, p.family_friendly, p.amenities, p.hero_image, p.media, p.description, p.created_at
                FROM wishlist_items w
                JOIN properties p ON p.id = w.property_id
                WHERE w.visitor_id=?
                ORDER BY w.created_at DESC""", propertyMapper, visitorId);
    }

    public List<Property> getPropertiesByIds(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return jdbc.query(con -> {
            var ps = con.prepareStatement("""
                    SELECT id, public_title, location, nightly_price, family_friendly, amenities, hero_image, media, description, created_at
                    FROM properties
                    WHERE id = ANY(?::text[])
                    ORDER BY created_at DESC""");
            ps.setArray(1, con.createArrayOf("text", ids.toArray()));
            return ps;
        }, propertyMapper);
    }

    public PropertyFeedback addPropertyFeedback(String propertyId, String visitorId, int rating, String comment) {
        String trimmedComment = comment == null ? "" : comment.trim();
        if (trimmedComment.length() > 1000) {
            throw new BadRequestException("comment must be at most 1000 characters");
        }

        Long existingId = jdbc.query("""
                SELECT id FROM property_feedback WHERE property_id = ? AND visitor_id = ? LIMIT 1
                """, rs -> rs.next() ? rs.getLong(1) : null, propertyId, visitorId);
        if (existingId != null) {
            throw new ConflictException("feedback already submitted for this property");
        }

        return jdbc.queryForObject("""
                INSERT INTO property_feedback(property_id, visitor_id, rating, comment)
                VALUES (?, ?, ?, ?)
                RETURNING id, property_id, visitor_id, rating, comment, created_at
                """, feedbackMapper, propertyId, visitorId, rating, trimmedComment);
    }

    private final RowMapper<PropertyFeedback> feedbackMapper = (rs, rowNum) -> {
        PropertyFeedback f = new PropertyFeedback();
        f.setId(rs.getLong("id"));
        f.setPropertyId(rs.getString("property_id"));
        f.setVisitorId(rs.getString("visitor_id"));
        f.setRating(rs.getInt("rating"));
        f.setComment(rs.getString("comment"));
        f.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        return f;
    };

    public List<PropertyFeedback> listPropertyReviews(String propertyId, int limit) {
        int effectiveLimit = limit <= 0 ? 20 : limit;
        return jdbc.query("""
                SELECT id, property_id, visitor_id, rating, comment, created_at
                FROM property_feedback
                WHERE property_id = ?
                ORDER BY created_at DESC
                LIMIT ?""", feedbackMapper, propertyId, effectiveLimit);
    }

    private final RowMapper<PropertyFeedbackSummary> feedbackSummaryMapper = (rs, rowNum) -> new PropertyFeedbackSummary(
            rs.getString("id"), rs.getDouble("avg_rating"), rs.getLong("review_count"));

    public List<PropertyFeedbackSummary> getPropertyFeedbackSummary() {
        return jdbc.query("""
                SELECT
                    p.id,
                    COALESCE(ROUND(AVG(f.rating)::numeric, 2), 0) AS avg_rating,
                    COALESCE(COUNT(f.id), 0) AS review_count
                FROM properties p
                LEFT JOIN property_feedback f ON f.property_id = p.id
                WHERE p.active = true
                GROUP BY p.id
                ORDER BY p.created_at DESC""", feedbackSummaryMapper);
    }

    public PropertyFeedbackSummary getPropertyFeedbackSummaryById(String propertyId) {
        try {
            return jdbc.queryForObject("""
                    SELECT
                        p.id,
                        COALESCE(ROUND(AVG(f.rating)::numeric, 2), 0) AS avg_rating,
                        COALESCE(COUNT(f.id), 0) AS review_count
                    FROM properties p
                    LEFT JOIN property_feedback f ON f.property_id = p.id
                    WHERE p.id = ? AND p.active = true
                    GROUP BY p.id""", feedbackSummaryMapper, propertyId);
        } catch (EmptyResultDataAccessException e) {
            throw new NotFoundException("property not found");
        }
    }
}
