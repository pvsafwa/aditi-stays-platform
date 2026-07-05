package com.aditistays.coreapi.repository;

import java.util.List;
import java.util.Map;

import com.aditistays.coreapi.model.CampaignBanner;
import com.aditistays.coreapi.service.BadRequestException;
import com.aditistays.coreapi.service.NotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class BannerRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @SneakyThrows
    private Map<String, Object> parseMetadata(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<String, Object> parsed = objectMapper.readValue(raw, Map.class);
        return parsed == null ? Map.of() : parsed;
    }

    private final RowMapper<CampaignBanner> bannerMapper = (rs, rowNum) -> {
        CampaignBanner b = new CampaignBanner();
        b.setId(rs.getLong("id"));
        b.setTitle(rs.getString("title"));
        b.setUrl(rs.getString("url"));
        b.setPlatform(rs.getString("platform"));
        b.setCoverUrl(rs.getString("cover_url"));
        b.setMetadata(parseMetadata(rs.getString("metadata")));
        b.setActive(rs.getBoolean("active"));
        b.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        b.setUpdatedAt(rs.getTimestamp("updated_at").toInstant());
        return b;
    };

    public List<CampaignBanner> listActiveBanners() {
        return jdbc.query("""
                SELECT id, title, url, platform, cover_url, metadata, active, created_at, updated_at
                FROM campaign_banners
                WHERE active=true
                ORDER BY created_at DESC""", bannerMapper);
    }

    @SneakyThrows
    public CampaignBanner addBanner(String title, String url, String platform, String coverUrl, Map<String, Object> metadata) {
        String trimmedTitle = title == null ? "" : title.trim();
        String trimmedUrl = url == null ? "" : url.trim();
        String normalizedPlatform = platform == null ? "" : platform.trim().toUpperCase();
        String trimmedCoverUrl = coverUrl == null ? "" : coverUrl.trim();

        if (trimmedTitle.isEmpty()) {
            throw new BadRequestException("title is required");
        }
        if (trimmedUrl.isEmpty()) {
            throw new BadRequestException("url is required");
        }
        if (normalizedPlatform.isEmpty()) {
            normalizedPlatform = "OTHER";
        }
        Map<String, Object> effectiveMetadata = metadata == null ? Map.of() : metadata;
        String metadataJson = objectMapper.writeValueAsString(effectiveMetadata);

        return jdbc.queryForObject("""
                INSERT INTO campaign_banners(title, url, platform, cover_url, metadata, active)
                VALUES (?, ?, ?, ?, ?::jsonb, true)
                RETURNING id, title, url, platform, cover_url, metadata, active, created_at, updated_at
                """, bannerMapper, trimmedTitle, trimmedUrl, normalizedPlatform, trimmedCoverUrl, metadataJson);
    }

    public void deleteBanner(long bannerId) {
        jdbc.update("""
                UPDATE campaign_banners
                SET active=false, updated_at=NOW()
                WHERE id=?""", bannerId);
    }

    @SneakyThrows
    public CampaignBanner updateBanner(long bannerId, String title, String url, String platform, String coverUrl, Map<String, Object> metadata) {
        String trimmedTitle = title == null ? "" : title.trim();
        String trimmedUrl = url == null ? "" : url.trim();
        String normalizedPlatform = platform == null ? "" : platform.trim().toUpperCase();
        String trimmedCoverUrl = coverUrl == null ? "" : coverUrl.trim();

        if (trimmedTitle.isEmpty()) {
            throw new BadRequestException("title is required");
        }
        if (trimmedUrl.isEmpty()) {
            throw new BadRequestException("url is required");
        }
        if (normalizedPlatform.isEmpty()) {
            normalizedPlatform = "OTHER";
        }
        Map<String, Object> effectiveMetadata = metadata == null ? Map.of() : metadata;
        String metadataJson = objectMapper.writeValueAsString(effectiveMetadata);

        try {
            return jdbc.queryForObject("""
                    UPDATE campaign_banners
                    SET title=?, url=?, platform=?, cover_url=?, metadata=?::jsonb, updated_at=NOW()
                    WHERE id=? AND active=true
                    RETURNING id, title, url, platform, cover_url, metadata, active, created_at, updated_at
                    """, bannerMapper, trimmedTitle, trimmedUrl, normalizedPlatform, trimmedCoverUrl, metadataJson, bannerId);
        } catch (EmptyResultDataAccessException e) {
            throw new NotFoundException("banner not found");
        }
    }
}
