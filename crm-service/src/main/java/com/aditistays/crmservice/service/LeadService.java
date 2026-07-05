package com.aditistays.crmservice.service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.aditistays.crmservice.client.CatalogClient;
import com.aditistays.crmservice.client.ChatClient;
import com.aditistays.crmservice.config.AppProperties;
import com.aditistays.crmservice.model.Lead;
import com.aditistays.crmservice.model.Payment;
import com.aditistays.crmservice.outbox.OutboxRepository;
import com.aditistays.crmservice.outbox.TraceContextCarrier;
import com.aditistays.crmservice.repository.LeadRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadService {

    private static final String HMAC_ALGO = "HmacSHA256";

    private final LeadRepository leadRepository;
    private final CatalogClient catalogClient;
    private final ChatClient chatClient;
    private final OutboxRepository outboxRepository;
    private final TraceContextCarrier traceContextCarrier;
    private final ObjectMapper objectMapper;
    private final byte[] userChatTokenSecret;
    private final Duration userChatTokenTtl;

    public LeadService(LeadRepository leadRepository, CatalogClient catalogClient, ChatClient chatClient,
                        OutboxRepository outboxRepository, TraceContextCarrier traceContextCarrier,
                        ObjectMapper objectMapper, AppProperties props) {
        this.leadRepository = leadRepository;
        this.catalogClient = catalogClient;
        this.chatClient = chatClient;
        this.outboxRepository = outboxRepository;
        this.traceContextCarrier = traceContextCarrier;
        this.objectMapper = objectMapper;
        this.userChatTokenSecret = props.userChatTokenSecret().getBytes(StandardCharsets.UTF_8);
        this.userChatTokenTtl = props.userChatTokenTtl();
    }

    public record LeadResult(Lead lead, boolean resumed) {
    }

    @Transactional
    public LeadResult createOrReuseLead(String visitorId, String propertyId, String customerName, String mobile, boolean disclaimerAccepted) {
        validateLeadInput(visitorId, propertyId, customerName, mobile, disclaimerAccepted);
        if (!catalogClient.propertyExists(propertyId)) {
            throw new NotFoundException("property not found");
        }

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
            publishEvent("lead", String.valueOf(lead.getId()), "lead_resumed", event);

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
        publishEvent("lead", String.valueOf(lead.getId()), "lead_created", event);

        return new LeadResult(lead, false);
    }

    @Transactional
    public void updateInventoryStatus(long leadId, boolean available, String note) {
        leadRepository.updateInventoryStatus(leadId, available, note);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "inventory_status");
        event.put("lead_id", leadId);
        event.put("status", available ? "AVAILABLE" : "UNAVAILABLE");
        event.put("admin_note", note);
        event.put("created_at", Instant.now());
        publishEvent("lead", String.valueOf(leadId), "inventory_status", event);
    }

    @Transactional
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
        publishEvent("lead", String.valueOf(leadId), "payment_received", event);

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

    @Transactional
    public void confirmLead(long leadId, String details) {
        String effectiveDetails = (details == null || details.trim().isEmpty()) ? "Confirmed by admin" : details;
        leadRepository.confirmLead(leadId, effectiveDetails);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "lead_confirmed");
        event.put("lead_id", leadId);
        event.put("details", effectiveDetails);
        event.put("created_at", Instant.now());
        publishEvent("lead", String.valueOf(leadId), "lead_confirmed", event);
    }

    public Map<String, Object> getLeadContext(long leadId) {
        Lead lead = leadRepository.getLeadById(leadId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("lead", lead);
        result.put("browsing_history", catalogClient.getBrowsingHistory(lead.getVisitorId()));
        result.put("wishlist", catalogClient.getWishlist(lead.getVisitorId()));
        result.put("payment_summary", leadRepository.paymentSummary(leadId));
        result.put("payments", leadRepository.listPayments(leadId));
        return result;
    }

    /**
     * All leads ordered by most-recent activity (a lead's own updates, or a chat
     * message against it -- whichever is newer), truncated to the caller's limit.
     * chat_messages lives in chat-service's own database now, so the "last
     * message" preview is fetched in bulk and merged in memory rather than a
     * SQL join.
     */
    public List<Lead> listLeadsWithLastMessage(int limit) {
        int effectiveLimit = (limit <= 0 || limit > 500) ? 200 : limit;

        List<Lead> leads = leadRepository.listAllLeads();
        List<Long> leadIds = leads.stream().map(Lead::getId).toList();
        Map<String, Map<String, Object>> lastMessages = chatClient.getLastMessages(leadIds);

        for (Lead lead : leads) {
            Map<String, Object> lastMessage = lastMessages.get(String.valueOf(lead.getId()));
            if (lastMessage != null) {
                lead.setLastMessage(String.valueOf(lastMessage.getOrDefault("content", "")));
                lead.setLastSenderRole(String.valueOf(lastMessage.getOrDefault("sender_role", "")));
                lead.setLastMessageAt(Instant.parse(String.valueOf(lastMessage.get("created_at"))));
            } else {
                lead.setLastMessage("");
                lead.setLastSenderRole("");
                lead.setLastMessageAt(lead.getUpdatedAt());
            }
        }

        List<Lead> sorted = new ArrayList<>(leads);
        sorted.sort(Comparator.comparing(Lead::getLastMessageAt).reversed());

        return sorted.size() > effectiveLimit ? sorted.subList(0, effectiveLimit) : sorted;
    }

    /**
     * Writes to the outbox in the same DB transaction as the caller's business
     * write, instead of publishing to Redis directly -- see OutboxRelay for why.
     * Embeds the current trace context so chat-service can continue the same
     * trace when it relays this event to the admin notifications socket.
     */
    @SneakyThrows
    private void publishEvent(String aggregateType, String aggregateId, String eventType, Map<String, Object> payload) {
        Map<String, String> traceHeaders = traceContextCarrier.currentTraceHeaders();
        if (!traceHeaders.isEmpty()) {
            payload.put("trace", traceHeaders);
        }
        String body = objectMapper.writeValueAsString(payload);
        outboxRepository.insert(aggregateType, aggregateId, eventType, body);
    }

    private static void validateLeadInput(String visitorId, String propertyId, String customerName, String mobile, boolean disclaimerAccepted) {
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
