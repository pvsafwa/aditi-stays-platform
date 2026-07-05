package com.aditistays.coreapi.service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.aditistays.coreapi.config.AppProperties;
import com.aditistays.coreapi.model.Lead;
import com.aditistays.coreapi.model.Payment;
import com.aditistays.coreapi.repository.LeadRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.SneakyThrows;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class LeadService {

    private static final String HMAC_ALGO = "HmacSHA256";

    private final LeadRepository leadRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final String notifyTopic;
    private final byte[] userChatTokenSecret;
    private final Duration userChatTokenTtl;

    public LeadService(LeadRepository leadRepository, StringRedisTemplate redisTemplate, ObjectMapper objectMapper, AppProperties props) {
        this.leadRepository = leadRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.notifyTopic = props.chatNotificationChannel();
        this.userChatTokenSecret = props.userChatTokenSecret().getBytes(StandardCharsets.UTF_8);
        this.userChatTokenTtl = props.userChatTokenTtl();
    }

    public record LeadResult(Lead lead, boolean resumed) {
    }

    public LeadResult createOrReuseLead(String visitorId, String propertyId, String customerName, String mobile, boolean disclaimerAccepted) {
        CatalogService.validateLeadInput(visitorId, propertyId, customerName, mobile, disclaimerAccepted);

        var existing = leadRepository.getExistingLeadForCustomer(propertyId, customerName, mobile);
        if (existing.isPresent()) {
            Lead lead = existing.get();
            leadRepository.touchLead(lead.getId(), visitorId);
            lead.setVisitorId(visitorId);
            lead.setUpdatedAt(Instant.now());

            Map<String, Object> event = new LinkedHashMap<>();
            event.put("event", "lead_resumed");
            event.put("lead_id", lead.getId());
            event.put("visitor_id", lead.getVisitorId());
            event.put("property_id", lead.getPropertyId());
            event.put("customer_name", lead.getCustomerName());
            event.put("mobile_number", lead.getMobileNumber());
            event.put("created_at", lead.getUpdatedAt());
            publishEvent(event);

            return new LeadResult(lead, true);
        }

        Lead lead = leadRepository.createLead(visitorId, propertyId, customerName, mobile, disclaimerAccepted);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "lead_created");
        event.put("lead_id", lead.getId());
        event.put("visitor_id", lead.getVisitorId());
        event.put("property_id", lead.getPropertyId());
        event.put("customer_name", lead.getCustomerName());
        event.put("mobile_number", lead.getMobileNumber());
        event.put("created_at", lead.getCreatedAt());
        publishEvent(event);

        return new LeadResult(lead, false);
    }

    public void updateInventoryStatus(long leadId, boolean available, String note) {
        leadRepository.updateInventoryStatus(leadId, available, note);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "inventory_status");
        event.put("lead_id", leadId);
        event.put("status", available ? "AVAILABLE" : "UNAVAILABLE");
        event.put("admin_note", note);
        event.put("created_at", Instant.now());
        publishEvent(event);
    }

    public Payment addPayment(long leadId, double amount, String paymentType) {
        if (amount <= 0) {
            throw new BadRequestException("amount should be > 0");
        }
        String upper = paymentType == null ? "" : paymentType.toUpperCase();
        if (!upper.equals("ADVANCE") && !upper.equals("FULL")) {
            throw new BadRequestException("payment_type must be ADVANCE or FULL");
        }
        Payment payment = leadRepository.addPayment(leadId, amount, upper);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "payment_received");
        event.put("lead_id", leadId);
        event.put("payment_type", upper);
        event.put("amount", amount);
        event.put("created_at", payment.getCreatedAt());
        publishEvent(event);

        return payment;
    }

    @SneakyThrows
    public String generateUserChatToken(long leadId) {
        if (leadId <= 0) {
            throw new BadRequestException("invalid lead id");
        }
        if (userChatTokenSecret.length == 0) {
            throw new IllegalStateException("chat token secret is not configured");
        }

        long expiryUnix = Instant.now().plus(userChatTokenTtl).getEpochSecond();
        String payload = leadId + "." + expiryUnix;
        Mac mac = Mac.getInstance(HMAC_ALGO);
        mac.init(new SecretKeySpec(userChatTokenSecret, HMAC_ALGO));
        byte[] signatureBytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        String signature = HexFormat.of().formatHex(signatureBytes);
        return payload + "." + signature;
    }

    public void confirmLead(long leadId, String details) {
        String effectiveDetails = (details == null || details.trim().isEmpty()) ? "Confirmed by admin" : details;
        leadRepository.confirmLead(leadId, effectiveDetails);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "lead_confirmed");
        event.put("lead_id", leadId);
        event.put("details", effectiveDetails);
        event.put("created_at", Instant.now());
        publishEvent(event);
    }

    @SneakyThrows
    private void publishEvent(Map<String, Object> payload) {
        String body = objectMapper.writeValueAsString(payload);
        redisTemplate.convertAndSend(notifyTopic, body);
    }
}
