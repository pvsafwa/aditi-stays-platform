package com.aditistays.coreapi.repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.aditistays.coreapi.model.DailyAnalytics;
import com.aditistays.coreapi.model.Lead;
import com.aditistays.coreapi.model.Payment;
import com.aditistays.coreapi.model.SummaryAnalytics;
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
public class LeadRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final PropertyRepository propertyRepository;

    private final RowMapper<Lead> leadMapper = (rs, rowNum) -> {
        Lead lead = new Lead();
        lead.setId(rs.getLong("id"));
        lead.setVisitorId(rs.getString("visitor_id"));
        lead.setPropertyId(rs.getString("property_id"));
        lead.setCustomerName(rs.getString("customer_name"));
        lead.setMobileNumber(rs.getString("mobile_number"));
        lead.setStatus(rs.getString("status"));
        lead.setDisclaimerAccepted(rs.getBoolean("disclaimer_accepted"));
        lead.setInventoryChecked(rs.getBoolean("inventory_checked"));
        lead.setAdminNotes(rs.getString("admin_notes"));
        lead.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        lead.setUpdatedAt(rs.getTimestamp("updated_at").toInstant());
        return lead;
    };

    private static final String LEAD_COLUMNS =
            "id, visitor_id, property_id, customer_name, mobile_number, status, disclaimer_accepted, inventory_checked, admin_notes, created_at, updated_at";

    public Optional<Lead> getExistingLeadForCustomer(String propertyId, String customerName, String mobile) {
        try {
            Lead lead = jdbc.queryForObject("""
                    SELECT %s
                    FROM leads
                    WHERE property_id=?
                      AND lower(customer_name)=lower(?)
                      AND mobile_number=?
                      AND status IN ('NEW_INQUIRY', 'AVAILABLE', 'PAYMENT_PENDING', 'CONFIRMED')
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """.formatted(LEAD_COLUMNS), leadMapper, propertyId, customerName.trim(), mobile.trim());
            return Optional.of(lead);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public void touchLead(long leadId, String visitorId) {
        jdbc.update("""
                UPDATE leads
                SET visitor_id=?, updated_at=NOW(), disclaimer_accepted=true
                WHERE id=?""", visitorId, leadId);
    }

    public Lead createLead(String visitorId, String propertyId, String customerName, String mobile, boolean disclaimerAccepted) {
        return jdbc.queryForObject("""
                INSERT INTO leads(visitor_id, property_id, customer_name, mobile_number, disclaimer_accepted)
                VALUES (?, ?, ?, ?, ?)
                RETURNING %s""".formatted(LEAD_COLUMNS), leadMapper,
                visitorId, propertyId, customerName, mobile, disclaimerAccepted);
    }

    public Lead getLeadById(long leadId) {
        try {
            return jdbc.queryForObject("SELECT %s FROM leads WHERE id=?".formatted(LEAD_COLUMNS), leadMapper, leadId);
        } catch (EmptyResultDataAccessException e) {
            throw new NotFoundException("lead not found");
        }
    }

    public List<Lead> listActiveLeads() {
        return jdbc.query("""
                SELECT %s
                FROM leads
                WHERE status IN ('NEW_INQUIRY', 'AVAILABLE', 'PAYMENT_PENDING')
                ORDER BY created_at DESC""".formatted(LEAD_COLUMNS), leadMapper);
    }

    public List<Lead> listLeads(int limit) {
        int effectiveLimit = (limit <= 0 || limit > 500) ? 200 : limit;
        return jdbc.query("""
                SELECT
                    l.id,
                    l.visitor_id,
                    l.property_id,
                    l.customer_name,
                    l.mobile_number,
                    l.status,
                    l.disclaimer_accepted,
                    l.inventory_checked,
                    l.admin_notes,
                    COALESCE(cm.content, '') AS last_message,
                    COALESCE(cm.sender_role, '') AS last_sender_role,
                    COALESCE(cm.created_at, l.updated_at) AS last_message_at,
                    l.created_at,
                    l.updated_at
                FROM leads l
                LEFT JOIN LATERAL (
                    SELECT content, sender_role, created_at
                    FROM chat_messages
                    WHERE lead_id = l.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) cm ON true
                ORDER BY COALESCE(cm.created_at, l.updated_at) DESC
                LIMIT ?""", (rs, rowNum) -> {
            Lead lead = leadMapper.mapRow(rs, rowNum);
            lead.setLastMessage(rs.getString("last_message"));
            lead.setLastSenderRole(rs.getString("last_sender_role"));
            lead.setLastMessageAt(rs.getTimestamp("last_message_at").toInstant());
            return lead;
        }, effectiveLimit);
    }

    public void updateInventoryStatus(long leadId, boolean available, String note) {
        String status = available ? "AVAILABLE" : "UNAVAILABLE";
        jdbc.update("""
                UPDATE leads
                SET inventory_checked=true, status=?, admin_notes=?, updated_at=NOW()
                WHERE id=?""", status, note, leadId);
    }

    public Payment addPayment(long leadId, double amount, String paymentType) {
        String upper = paymentType.toUpperCase();
        Payment payment = jdbc.queryForObject("""
                INSERT INTO payments(lead_id, amount, payment_type, source)
                VALUES (?, ?, ?, 'GPAY')
                RETURNING id, lead_id, amount, payment_type, source, created_at""", (rs, rowNum) -> {
            Payment p = new Payment();
            p.setId(rs.getLong("id"));
            p.setLeadId(rs.getLong("lead_id"));
            p.setAmount(rs.getDouble("amount"));
            p.setPaymentType(rs.getString("payment_type"));
            p.setSource(rs.getString("source"));
            p.setCreatedAt(rs.getTimestamp("created_at").toInstant());
            return p;
        }, leadId, amount, upper);

        String newStatus = upper.equals("FULL") ? "CONFIRMED" : "PAYMENT_PENDING";
        jdbc.update("UPDATE leads SET status=?, updated_at=NOW() WHERE id=?", newStatus, leadId);

        return payment;
    }

    public void confirmLead(long leadId, String details) {
        jdbc.update("""
                UPDATE leads
                SET status='CONFIRMED', admin_notes=?, updated_at=NOW()
                WHERE id=?""", details, leadId);
    }

    public DailyAnalytics dailyAnalytics(String day) {
        long inquiries = jdbc.queryForObject("SELECT COUNT(*) FROM leads WHERE DATE(created_at)=DATE(?)", Long.class, day);
        long bookings = jdbc.queryForObject("SELECT COUNT(*) FROM leads WHERE DATE(updated_at)=DATE(?) AND status='CONFIRMED'", Long.class, day);
        double advanceSum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at)=DATE(?) AND payment_type='ADVANCE'", Double.class, day);
        double fullSum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at)=DATE(?) AND payment_type='FULL'", Double.class, day);
        return new DailyAnalytics(day, inquiries, bookings, advanceSum, fullSum);
    }

    public SummaryAnalytics summaryAnalytics() {
        long totalInquiries = jdbc.queryForObject("SELECT COUNT(*) FROM leads", Long.class);
        long totalBookings = jdbc.queryForObject("SELECT COUNT(*) FROM leads WHERE status='CONFIRMED'", Long.class);
        double totalAdvanceSum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_type='ADVANCE'", Double.class);
        double totalFullSum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_type='FULL'", Double.class);
        return new SummaryAnalytics(totalInquiries, totalBookings, totalAdvanceSum, totalFullSum);
    }

    @SneakyThrows
    public List<Map<String, Object>> getLeadMessages(long leadId) {
        return jdbc.query("""
                SELECT sender_role, sender_label, message_type, content, metadata, created_at
                FROM chat_messages
                WHERE lead_id=?
                ORDER BY created_at ASC""", (rs, rowNum) -> {
            Map<String, Object> msg = new LinkedHashMap<>();
            msg.put("sender_role", rs.getString("sender_role"));
            msg.put("sender_label", rs.getString("sender_label"));
            msg.put("message_type", rs.getString("message_type"));
            msg.put("content", rs.getString("content"));
            msg.put("metadata", parseMetadata(rs.getString("metadata")));
            msg.put("created_at", rs.getTimestamp("created_at").toInstant());
            return msg;
        }, leadId);
    }

    @SneakyThrows
    private Map<String, Object> parseMetadata(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        return objectMapper.readValue(raw, Map.class);
    }

    public Map<String, Object> leadContext(long leadId) {
        Lead lead = getLeadById(leadId);
        List<com.aditistays.coreapi.model.BrowsingHistoryItem> history = propertyRepository.getBrowsingHistory(lead.getVisitorId(), 25);
        List<com.aditistays.coreapi.model.Property> wishlist = propertyRepository.getWishlist(lead.getVisitorId());

        Map<String, Object> paymentSummary = jdbc.queryForObject("""
                SELECT
                    COALESCE(SUM(CASE WHEN payment_type='ADVANCE' THEN amount ELSE 0 END), 0) AS advance_total,
                    COALESCE(SUM(CASE WHEN payment_type='FULL' THEN amount ELSE 0 END), 0) AS full_total,
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS count
                FROM payments
                WHERE lead_id=?
                """, (rs, rowNum) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("advance_total", rs.getDouble("advance_total"));
            m.put("full_total", rs.getDouble("full_total"));
            m.put("total", rs.getDouble("total"));
            m.put("count", rs.getLong("count"));
            return m;
        }, leadId);

        List<Map<String, Object>> payments = jdbc.query("""
                SELECT id, amount, payment_type, created_at
                FROM payments
                WHERE lead_id=?
                ORDER BY created_at DESC
                LIMIT 100
                """, (rs, rowNum) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("amount", rs.getDouble("amount"));
            m.put("payment_type", rs.getString("payment_type"));
            m.put("created_at", rs.getTimestamp("created_at").toInstant());
            return m;
        }, leadId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("lead", lead);
        result.put("browsing_history", history);
        result.put("wishlist", wishlist);
        result.put("payment_summary", paymentSummary);
        result.put("payments", payments);
        return result;
    }
}
