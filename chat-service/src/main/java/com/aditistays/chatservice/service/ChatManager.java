package com.aditistays.chatservice.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.aditistays.chatservice.config.AppProperties;
import com.aditistays.chatservice.repository.ChatRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.SneakyThrows;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Mirrors chat-service's Python app/services/chat_manager.py. */
@Component
public class ChatManager {

    private static final String ACTIVE_LEADS_SET = "chat:active_leads";

    public record SocketClient(WebSocketSession session, String role, String actor) {
    }

    private final ChatRepository chatRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final String chatEventsChannel;

    private final Map<Long, Set<SocketClient>> rooms = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    public ChatManager(ChatRepository chatRepository, StringRedisTemplate redisTemplate, ObjectMapper objectMapper, AppProperties props) {
        this.chatRepository = chatRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.chatEventsChannel = props.chatEventsChannel();
    }

    public void connect(long leadId, WebSocketSession session, String role, String actor) {
        synchronized (lock) {
            rooms.computeIfAbsent(leadId, k -> ConcurrentHashMap.newKeySet()).add(new SocketClient(session, role, actor));
        }
        redisTemplate.opsForSet().add(ACTIVE_LEADS_SET, String.valueOf(leadId));

        broadcastEvent(leadId, Map.of(
                "event", "presence",
                "lead_id", leadId,
                "role", role,
                "actor", actor,
                "at", Instant.now().toString()
        ), false);
    }

    public void disconnect(long leadId, WebSocketSession session) {
        synchronized (lock) {
            Set<SocketClient> set = rooms.get(leadId);
            if (set != null) {
                set.removeIf(c -> c.session().getId().equals(session.getId()));
                if (set.isEmpty()) {
                    rooms.remove(leadId);
                }
            }
        }
        if (activeCount(leadId) == 0) {
            redisTemplate.opsForSet().remove(ACTIVE_LEADS_SET, String.valueOf(leadId));
        }
    }

    public int activeCount(long leadId) {
        synchronized (lock) {
            Set<SocketClient> set = rooms.get(leadId);
            return set == null ? 0 : set.size();
        }
    }

    @SneakyThrows
    public void broadcastEvent(long leadId, Map<String, Object> payload, boolean persist) {
        if (persist) {
            saveMessage(leadId, payload);
        }

        String data = objectMapper.writeValueAsString(payload);

        List<SocketClient> clients;
        synchronized (lock) {
            clients = new ArrayList<>(rooms.getOrDefault(leadId, Set.of()));
        }

        List<SocketClient> stale = new ArrayList<>();
        for (SocketClient client : clients) {
            try {
                client.session().sendMessage(new TextMessage(data));
            } catch (Exception e) {
                stale.add(client);
            }
        }
        if (!stale.isEmpty()) {
            synchronized (lock) {
                Set<SocketClient> set = rooms.get(leadId);
                if (set != null) {
                    set.removeAll(stale);
                }
            }
        }

        redisTemplate.convertAndSend(chatEventsChannel, data);
    }

    @SuppressWarnings("unchecked")
    private void saveMessage(long leadId, Map<String, Object> payload) {
        String senderRole = String.valueOf(payload.getOrDefault("sender_role", "system"));
        String senderLabel = String.valueOf(payload.getOrDefault("sender_label", "System"));
        String messageType = String.valueOf(payload.getOrDefault("message_type", "TEXT"));
        Object contentObj = payload.containsKey("content") ? payload.get("content") : payload.get("text");
        String content = contentObj == null ? "" : String.valueOf(contentObj);
        Object metadataObj = payload.get("metadata");
        Map<String, Object> metadata = metadataObj instanceof Map ? (Map<String, Object>) metadataObj : Map.of();

        chatRepository.saveMessage(leadId, senderRole, senderLabel, messageType, content, metadata);
    }

    public List<Map<String, Object>> fetchHistory(long leadId) {
        return chatRepository.fetchHistory(leadId);
    }
}
