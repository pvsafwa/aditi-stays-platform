package com.aditistays.catalogservice.controller;

import java.util.Map;

import com.aditistays.catalogservice.dto.Requests.BannerRequest;
import com.aditistays.catalogservice.model.CampaignBanner;
import com.aditistays.catalogservice.model.Property;
import com.aditistays.catalogservice.model.PropertyCreateInput;
import com.aditistays.catalogservice.repository.BannerRepository;
import com.aditistays.catalogservice.repository.PropertyRepository;
import com.aditistays.catalogservice.service.BadRequestException;
import com.aditistays.catalogservice.service.CatalogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class CatalogAdminController {

    private final BannerRepository bannerRepository;
    private final PropertyRepository propertyRepository;
    private final CatalogService catalogService;
    private final AdminAuditSupport audit;

    // ---- banners ----

    @GetMapping("/banners")
    public Map<String, Object> listBannersAdmin(HttpServletRequest request) {
        var rows = bannerRepository.listActiveBanners();
        audit.record(request, "list_banners", "banner", "*", Map.of("count", rows.size()));
        return Map.of("data", rows);
    }

    @PostMapping("/banners")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addBanner(@RequestBody BannerRequest in, HttpServletRequest request) {
        CampaignBanner row = bannerRepository.addBanner(in.getTitle(), in.getUrl(), in.getPlatform(), in.getCoverUrl(), in.getMetadata());
        audit.record(request, "add_banner", "banner", String.valueOf(row.getId()), Map.of("title", row.getTitle(), "url", row.getUrl()));
        return Map.of("data", row);
    }

    @PutMapping("/banners/{bannerId}")
    public Map<String, Object> updateBanner(@PathVariable long bannerId, @RequestBody BannerRequest in, HttpServletRequest request) {
        CampaignBanner row = bannerRepository.updateBanner(bannerId, in.getTitle(), in.getUrl(), in.getPlatform(), in.getCoverUrl(), in.getMetadata());
        audit.record(request, "update_banner", "banner", String.valueOf(row.getId()), Map.of("title", row.getTitle(), "url", row.getUrl()));
        return Map.of("data", row);
    }

    @DeleteMapping("/banners/{bannerId}")
    public Map<String, Object> deleteBanner(@PathVariable long bannerId, HttpServletRequest request) {
        bannerRepository.deleteBanner(bannerId);
        audit.record(request, "delete_banner", "banner", String.valueOf(bannerId), null);
        return Map.of("ok", true);
    }

    // ---- properties ----

    @GetMapping("/properties")
    public Map<String, Object> listPropertiesAdmin(HttpServletRequest request) {
        var rows = propertyRepository.listAdminProperties();
        audit.record(request, "list_admin_properties", "property", "*", Map.of("count", rows.size()));
        return Map.of("data", rows);
    }

    @PostMapping("/properties")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addProperty(@RequestBody PropertyCreateInput in, HttpServletRequest request) {
        Property row = catalogService.createProperty(in);
        audit.record(request, "add_property", "property", row.getId(),
                Map.of("location", row.getLocation(), "nightly_price", row.getNightlyPrice()));
        return Map.of("data", row);
    }

    @PutMapping("/properties/{id}")
    public Map<String, Object> updateProperty(@PathVariable String id, @RequestBody PropertyCreateInput in, HttpServletRequest request) {
        String propertyId = id == null ? "" : id.trim();
        if (propertyId.isEmpty()) {
            throw new BadRequestException("property id is required");
        }
        Property row = catalogService.updateProperty(propertyId, in);
        audit.record(request, "update_property", "property", row.getId(),
                Map.of("location", row.getLocation(), "nightly_price", row.getNightlyPrice()));
        return Map.of("data", row);
    }

    @DeleteMapping("/properties/{id}")
    public Map<String, Object> deleteProperty(@PathVariable String id, HttpServletRequest request) {
        String propertyId = id == null ? "" : id.trim();
        if (propertyId.isEmpty()) {
            throw new BadRequestException("property id is required");
        }
        propertyRepository.deactivateProperty(propertyId);
        audit.record(request, "deactivate_property", "property", propertyId, null);
        return Map.of("ok", true);
    }
}
