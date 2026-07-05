package com.aditistays.crmservice.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import com.aditistays.crmservice.client.ChatClient;
import com.aditistays.crmservice.dto.Requests.ConfirmLeadRequest;
import com.aditistays.crmservice.dto.Requests.InventoryCheckRequest;
import com.aditistays.crmservice.dto.Requests.PaymentRequest;
import com.aditistays.crmservice.model.Lead;
import com.aditistays.crmservice.model.Payment;
import com.aditistays.crmservice.repository.LeadRepository;
import com.aditistays.crmservice.service.LeadService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
    private final LeadService leadService;
    private final ChatClient chatClient;
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
        var leads = leadService.listLeadsWithLastMessage(limit);
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
        var context = leadService.getLeadContext(leadId);
        audit.record(request, "view_lead_context", "lead", String.valueOf(leadId), null);
        return Map.of("data", context);
    }

    @GetMapping("/leads/{leadId}/messages")
    public Map<String, Object> getLeadMessages(@PathVariable long leadId) {
        return Map.of("data", chatClient.getMessages(leadId));
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
}
