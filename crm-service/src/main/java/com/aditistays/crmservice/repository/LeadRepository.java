package com.aditistays.crmservice.repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.aditistays.crmservice.model.DailyAnalytics;
import com.aditistays.crmservice.model.Lead;
import com.aditistays.crmservice.model.Payment;
import com.aditistays.crmservice.model.SummaryAnalytics;
import com.aditistays.crmservice.service.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class LeadRepository {

    private final JdbcTemplate jdbc;

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

    /**
     * All leads, most-recently-updated first. Chat-activity-based ordering and the
     * per-lead "last message" preview are layered on in LeadService (chat_messages
     * now lives in chat-service's own database, so it's a cross-service enrichment
     * rather than a SQL join).
     */
    public List<Lead> listAllLeads() {
        return jdbc.query("SELECT %s FROM leads ORDER BY updated_at DESC".formatted(LEAD_COLUMNS), leadMapper);
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

    public Map<String, Object> paymentSummary(long leadId) {
        return jdbc.queryForObject("""
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
    }

    public List<Map<String, Object>> listPayments(long leadId) {
        return jdbc.query("""
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
    }
}
