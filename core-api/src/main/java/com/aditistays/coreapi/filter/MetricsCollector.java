package com.aditistays.coreapi.filter;

import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

@Component
public class MetricsCollector {

    private final AtomicLong totalRequests = new AtomicLong();
    private final Map<Integer, AtomicLong> byStatus = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> byRoute = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> latencyMs = new ConcurrentHashMap<>();

    public void record(int status, String route, long latencyMillis) {
        totalRequests.incrementAndGet();
        byStatus.computeIfAbsent(status, k -> new AtomicLong()).incrementAndGet();
        byRoute.computeIfAbsent(route, k -> new AtomicLong()).incrementAndGet();
        latencyMs.computeIfAbsent(route, k -> new AtomicLong()).addAndGet(latencyMillis);
    }

    public String prometheusText() {
        StringBuilder b = new StringBuilder();
        b.append("# HELP aditi_core_requests_total Total HTTP requests\n");
        b.append("# TYPE aditi_core_requests_total counter\n");
        b.append("aditi_core_requests_total ").append(totalRequests.get()).append('\n');

        b.append("# HELP aditi_core_requests_by_status_total Requests by HTTP status\n");
        b.append("# TYPE aditi_core_requests_by_status_total counter\n");
        for (Map.Entry<Integer, AtomicLong> e : new TreeMap<>(byStatus).entrySet()) {
            b.append("aditi_core_requests_by_status_total{status=\"").append(e.getKey()).append("\"} ")
                    .append(e.getValue().get()).append('\n');
        }

        b.append("# HELP aditi_core_requests_by_route_total Requests by route\n");
        b.append("# TYPE aditi_core_requests_by_route_total counter\n");
        for (Map.Entry<String, AtomicLong> e : new TreeMap<>(byRoute).entrySet()) {
            String route = e.getKey();
            long count = e.getValue().get();
            double avgMs = count > 0 ? (double) latencyMs.getOrDefault(route, new AtomicLong()).get() / count : 0;
            String escaped = route.replace("\"", "\\\"");
            b.append("aditi_core_requests_by_route_total{route=\"").append(escaped).append("\"} ").append(count).append('\n');
            b.append("aditi_core_route_avg_latency_ms{route=\"").append(escaped).append("\"} ").append(String.format("%.2f", avgMs)).append('\n');
        }

        return b.toString();
    }
}
