package com.aditistays.chatservice.config;

import com.aditistays.chatservice.websocket.AdminNotificationsWebSocketHandler;
import com.aditistays.chatservice.websocket.ChatWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatWebSocketHandler;
    private final AdminNotificationsWebSocketHandler adminNotificationsWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatWebSocketHandler, "/ws/chat/*").setAllowedOrigins("*");
        registry.addHandler(adminNotificationsWebSocketHandler, "/ws/admin/notifications").setAllowedOrigins("*");
    }
}
