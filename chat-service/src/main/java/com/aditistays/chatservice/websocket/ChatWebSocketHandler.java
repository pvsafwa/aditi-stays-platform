package com.aditistays.chatservice.websocket;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.aditistays.chatservice.dto.ChatInput;
import com.aditistays.chatservice.security.ChatSecurity;
import com.aditistays.chatservice.service.ChatManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

/** Mirrors chat-service's Python /ws/chat/{lead_id} route in app/websocket/routes.py. */
@Component
@RequiredArgsConstructor
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Pattern LEAD_ID_PATTERN = Pattern.compile("/ws/chat/(\\d+)");

    private record Connection(WebSocketSession session, long leadId, String role) {
    }

    private final ChatSecurity security;
    private final ChatManager chatManager;
    private final MeterRegistry meterRegistry;
    private final ObjectMapper objectMapper;

    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession rawSession) throws Exception {
        Long leadId = extractLeadId(rawSession);
        if (leadId == null) {
            rawSession.close(CloseStatus.BAD_DATA);
            return;
        }

        Map<String, String> query = UriComponentsBuilder.fromUri(rawSession.getUri()).build().getQueryParams().toSingleValueMap();
        String requestedRole = query.getOrDefault("role", "user");
        String role = "admin".equals(requestedRole) ? "admin" : "user";
        String actor = query.getOrDefault("actor", role);
        String token = query.get("token");

        if (role.equals("admin")) {
            if (!security.verifyAdminWsToken(token)) {
                rawSession.close(CloseStatus.POLICY_VIOLATION);
                return;
            }
        } else {
            if (!security.verifyUserChatToken(token, leadId)) {
                rawSession.close(CloseStatus.POLICY_VIOLATION);
                return;
            }
            actor = "user";
        }

        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(rawSession, 10_000, 512 * 1024);
        connections.put(rawSession.getId(), new Connection(session, leadId, role));

        chatManager.connect(leadId, session, role, actor);

        var history = chatManager.fetchHistory(leadId);
        Map<String, Object> historyPayload = new LinkedHashMap<>();
        historyPayload.put("event", "history");
        historyPayload.put("items", history);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(historyPayload)));
    }

    @Override
    protected void handleTextMessage(WebSocketSession rawSession, TextMessage message) throws Exception {
        Connection conn = connections.get(rawSession.getId());
        if (conn == null) {
            return;
        }

        ChatInput input = objectMapper.readValue(message.getPayload(), ChatInput.class);
        String senderRole = conn.role().equals("admin") ? "admin" : "user";
        String label = input.getSenderLabel() == null ? "" : input.getSenderLabel().trim();
        String senderLabel = label.isEmpty() ? (senderRole.equals("admin") ? "Admin" : "Guest") : label;
        boolean isStatus = "status".equals(input.getType());

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "message");
        event.put("lead_id", conn.leadId());
        event.put("sender_role", senderRole);
        event.put("sender_label", senderLabel);
        event.put("message_type", isStatus ? "STATUS" : "TEXT");
        event.put("content", input.getText());
        event.put("metadata", input.getMetadata() == null ? Map.of() : input.getMetadata());
        event.put("created_at", Instant.now().toString());

        meterRegistry.counter("aditi_chat_websocket_messages_total").increment();
        chatManager.broadcastEvent(conn.leadId(), event, true);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession rawSession, CloseStatus status) {
        Connection conn = connections.remove(rawSession.getId());
        if (conn != null) {
            chatManager.disconnect(conn.leadId(), conn.session());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession rawSession, Throwable exception) {
        afterConnectionClosed(rawSession, CloseStatus.SERVER_ERROR);
    }

    private static Long extractLeadId(WebSocketSession session) {
        Matcher m = LEAD_ID_PATTERN.matcher(session.getUri().getPath());
        if (!m.find()) {
            return null;
        }
        try {
            return Long.parseLong(m.group(1));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
