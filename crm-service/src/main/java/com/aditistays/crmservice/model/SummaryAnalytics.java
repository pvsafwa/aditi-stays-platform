package com.aditistays.crmservice.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SummaryAnalytics {
    private long totalInquiries;
    private long totalBookings;
    private double totalAdvanceSum;
    private double totalFullSum;
}
