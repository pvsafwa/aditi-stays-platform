package com.aditistays.chatservice.tracing;

import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.propagation.Propagator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Extracts the trace context crm-service embedded into an outbox event's JSON
 * (see crm-service's own TraceContextCarrier) and starts a child span from it,
 * so the admin-notification relay shows up as part of the same trace as the
 * business action that produced the event, even though it arrived over Redis
 * pub/sub rather than an HTTP call.
 */
@Component
@RequiredArgsConstructor
public class TraceContextCarrier {

    private final Tracer tracer;
    private final Propagator propagator;
    private final ObjectMapper objectMapper;

    @SuppressWarnings("unchecked")
    public Span startSpanFromEventJson(String json, String spanName) {
        try {
            Map<String, Object> parsed = objectMapper.readValue(json, Map.class);
            Object traceObj = parsed.get("trace");
            if (traceObj instanceof Map) {
                Map<String, String> headers = (Map<String, String>) traceObj;
                return propagator.extract(headers, Map::get).name(spanName).start();
            }
        } catch (Exception ignored) {
            // Not JSON, or no embedded trace -- fall through to an untraced span.
        }
        return tracer.nextSpan().name(spanName).start();
    }
}
