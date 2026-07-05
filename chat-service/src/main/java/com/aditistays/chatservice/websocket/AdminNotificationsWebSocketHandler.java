package com.aditistays.chatservice.websocket;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.aditistays.chatservice.config.AppProperties;
import com.aditistays.chatservice.security.ChatSecurity;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

/** Mirrors chat-service's Python /ws/admin/notifications route: bridges Redis pub/sub to the socket. */
@Component
@RequiredArgsConstructor
public class AdminNotificationsWebSocketHandler extends TextWebSocketHandler {

    private final ChatSecurity security;
    private final AppProperties props;
    private final RedisMessageListenerContainer container;

    private final Map<String, MessageListener> listeners = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession rawSession) throws Exception {
        Map<String, String> query = UriComponentsBuilder.fromUri(rawSession.getUri()).build().getQueryParams().toSingleValueMap();
        String token = query.get("token");
        if (!security.verifyAdminWsToken(token)) {
            rawSession.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(rawSession, 10_000, 512 * 1024);
        MessageListener listener = (message, pattern) -> {
            try {
                session.sendMessage(new TextMessage(new String(message.getBody(), StandardCharsets.UTF_8)));
            } catch (Exception ignored) {
                // Session likely closing; nothing to do.
            }
        };
        listeners.put(rawSession.getId(), listener);
        container.addMessageListener(listener, new ChannelTopic(props.leadNotificationChannel()));
        container.addMessageListener(listener, new ChannelTopic(props.chatEventsChannel()));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession rawSession, CloseStatus status) {
        MessageListener listener = listeners.remove(rawSession.getId());
        if (listener != null) {
            container.removeMessageListener(listener);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession rawSession, Throwable exception) {
        afterConnectionClosed(rawSession, CloseStatus.SERVER_ERROR);
    }
}
