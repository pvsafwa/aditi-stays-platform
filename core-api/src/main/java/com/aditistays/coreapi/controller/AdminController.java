package com.aditistays.coreapi.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import com.aditistays.coreapi.dto.Requests.BannerRequest;
import com.aditistays.coreapi.dto.Requests.ConfirmLeadRequest;
import com.aditistays.coreapi.dto.Requests.InventoryCheckRequest;
import com.aditistays.coreapi.dto.Requests.PaymentRequest;
import com.aditistays.coreapi.model.AdminProperty;
import com.aditistays.coreapi.model.CampaignBanner;
import com.aditistays.coreapi.model.Lead;
import com.aditistays.coreapi.model.Payment;
import com.aditistays.coreapi.model.Property;
import com.aditistays.coreapi.model.PropertyCreateInput;
import com.aditistays.coreapi.repository.BannerRepository;
import com.aditistays.coreapi.repository.LeadRepository;
import com.aditistays.coreapi.repository.PropertyRepository;
import com.aditistays.coreapi.service.BadRequestException;
import com.aditistays.coreapi.service.CatalogService;
import com.aditistays.coreapi.service.LeadService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final LeadRepository leadRepository;
    private final BannerRepository bannerRepository;
    private final PropertyRepository propertyRepository;
    private final LeadService leadService;
    private final CatalogService catalogService;
    private final AdminAuditSupport audit;

    // ---- leads ----

    @GetMapping("/leads/active")
    public Map<String, Object> listActiveLeads(HttpServletRequest request) {
        var leads = leadRepository.listActiveLeads();
        audit.record(request, "list_active_leads", "lead", "*", Map.of("count", leads.size()));
        return Map.of("data", leads);
    }

    @GetMapping("/leads/all")
    public Map<String, Object> listAllLeads(@RequestParam(name = "limit", defaultValue = "200") int limit, HttpServletRequest request) {
        var leads = leadRepository.listLeads(limit);
        audit.record(request, "list_all_leads", "lead", "*", Map.of("count", leads.size()));
        return Map.of("data", leads);
    }

    @GetMapping("/leads/{leadId}")
    public Map<String, Object> getLead(@PathVariable long leadId) {
        Lead lead = leadRepository.getLeadById(leadId);
        return Map.of("data", lead);
    }

    @GetMapping("/leads/{leadId}/context")
    public Map<String, Object> getLeadContext(@PathVariable long leadId, HttpServletRequest request) {
        var context = leadRepository.leadContext(leadId);
        audit.record(request, "view_lead_context", "lead", String.valueOf(leadId), null);
        return Map.of("data", context);
    }

    @GetMapping("/leads/{leadId}/messages")
    public Map<String, Object> getLeadMessages(@PathVariable long leadId) {
        return Map.of("data", leadRepository.getLeadMessages(leadId));
    }

    @PostMapping("/leads/{leadId}/inventory-check")
    public Map<String, Object> updateInventory(@PathVariable long leadId, @RequestBody InventoryCheckRequest in, HttpServletRequest request) {
        leadService.updateInventoryStatus(leadId, in.isAvailable(), in.getNote());
        audit.record(request, "inventory_check", "lead", String.valueOf(leadId),
                Map.of("available", in.isAvailable(), "note", in.getNote() == null ? "" : in.getNote()));
        return Map.of("ok", true);
    }

    @PostMapping("/leads/{leadId}/payment")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addPayment(@PathVariable long leadId, @RequestBody PaymentRequest in, HttpServletRequest request) {
        Payment payment = leadService.addPayment(leadId, in.getAmount(), in.getPaymentType());
        audit.record(request, "add_payment", "lead", String.valueOf(leadId),
                Map.of("amount", in.getAmount(), "payment_type", in.getPaymentType() == null ? "" : in.getPaymentType()));
        return Map.of("data", payment);
    }

    @PostMapping("/leads/{leadId}/confirm")
    public Map<String, Object> confirmLead(@PathVariable long leadId, @RequestBody ConfirmLeadRequest in, HttpServletRequest request) {
        leadService.confirmLead(leadId, in.getDetails());
        audit.record(request, "confirm_lead", "lead", String.valueOf(leadId),
                Map.of("details", in.getDetails() == null ? "" : in.getDetails()));
        return Map.of("ok", true);
    }

    // ---- analytics ----

    @GetMapping("/analytics/daily")
    public Map<String, Object> dailyAnalytics(@RequestParam(name = "date", required = false) String date, HttpServletRequest request) {
        String day = (date == null || date.isEmpty()) ? LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE) : date;
        var data = leadRepository.dailyAnalytics(day);
        audit.record(request, "view_daily_analytics", "analytics", day, null);
        return Map.of("data", data);
    }

    @GetMapping("/analytics/summary")
    public Map<String, Object> summaryAnalytics(HttpServletRequest request) {
        var data = leadRepository.summaryAnalytics();
        audit.record(request, "view_summary_analytics", "analytics", "summary", null);
        return Map.of("data", data);
    }

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
