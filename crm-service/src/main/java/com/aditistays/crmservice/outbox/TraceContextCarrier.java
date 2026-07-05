package com.aditistays.crmservice.outbox;

import java.util.LinkedHashMap;
import java.util.Map;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.propagation.Propagator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Outbox events cross a Redis pub/sub boundary, not HTTP, so Micrometer's
 * automatic instrumentation doesn't propagate trace context onto them. This
 * embeds the current trace's W3C headers into the event JSON on publish;
 * chat-service's AdminNotificationsWebSocketHandler extracts them back out
 * to continue the same trace when it forwards the notification.
 */
@Component
@RequiredArgsConstructor
public class TraceContextCarrier {

    private final Tracer tracer;
    private final Propagator propagator;

    public Map<String, String> currentTraceHeaders() {
        Span currentSpan = tracer.currentSpan();
        if (currentSpan == null) {
            return Map.of();
        }
        Map<String, String> headers = new LinkedHashMap<>();
        propagator.inject(currentSpan.context(), headers, Map::put);
        return headers;
    }
}
