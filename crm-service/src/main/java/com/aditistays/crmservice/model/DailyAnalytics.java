package com.aditistays.crmservice.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DailyAnalytics {
    private String date;
    private long inquiries;
    private long bookings;
    private double advanceSum;
    private double fullSum;
}
