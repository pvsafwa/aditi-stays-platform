package com.aditistays.chatservice.filter;

import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

@Component
public class MetricsCollector {

    private final Instant startedAt = Instant.now();
    private final AtomicLong requestsTotal = new AtomicLong();
    private final Map<Integer, AtomicLong> byStatus = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> byPath = new ConcurrentHashMap<>();
    private final AtomicLong websocketMessagesTotal = new AtomicLong();

    public void recordHttp(String path, int status) {
        requestsTotal.incrementAndGet();
        byStatus.computeIfAbsent(status, k -> new AtomicLong()).incrementAndGet();
        byPath.computeIfAbsent(path, k -> new AtomicLong()).incrementAndGet();
    }

    public void recordWsMessage() {
        websocketMessagesTotal.incrementAndGet();
    }

    public String prometheusText() {
        StringBuilder sb = new StringBuilder();
        sb.append("# HELP aditi_chat_requests_total Total HTTP requests\n");
        sb.append("# TYPE aditi_chat_requests_total counter\n");
        sb.append("aditi_chat_requests_total ").append(requestsTotal.get()).append('\n');

        sb.append("# HELP aditi_chat_requests_by_status_total Requests by HTTP status\n");
        sb.append("# TYPE aditi_chat_requests_by_status_total counter\n");
        for (Map.Entry<Integer, AtomicLong> e : new TreeMap<>(byStatus).entrySet()) {
            sb.append("aditi_chat_requests_by_status_total{status=\"").append(e.getKey()).append("\"} ")
                    .append(e.getValue().get()).append('\n');
        }

        sb.append("# HELP aditi_chat_requests_by_path_total Requests by path\n");
        sb.append("# TYPE aditi_chat_requests_by_path_total counter\n");
        for (Map.Entry<String, AtomicLong> e : new TreeMap<>(byPath).entrySet()) {
            String escaped = e.getKey().replace("\"", "\\\"");
            sb.append("aditi_chat_requests_by_path_total{path=\"").append(escaped).append("\"} ")
                    .append(e.getValue().get()).append('\n');
        }

        sb.append("# HELP aditi_chat_websocket_messages_total Total websocket messages\n");
        sb.append("# TYPE aditi_chat_websocket_messages_total counter\n");
        sb.append("aditi_chat_websocket_messages_total ").append(websocketMessagesTotal.get()).append('\n');

        long uptime = Instant.now().getEpochSecond() - startedAt.getEpochSecond();
        sb.append("# HELP aditi_chat_uptime_seconds Process uptime in seconds\n");
        sb.append("# TYPE aditi_chat_uptime_seconds gauge\n");
        sb.append("aditi_chat_uptime_seconds ").append(uptime).append('\n');

        return sb.toString();
    }
}
