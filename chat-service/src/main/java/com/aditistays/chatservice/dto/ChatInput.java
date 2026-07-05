package com.aditistays.chatservice.dto;

import java.util.Map;

import lombok.Data;

@Data
public class ChatInput {
    private String type = "message";
    private String senderRole;
    private String senderLabel;
    private String text;
    private Map<String, Object> metadata = Map.of();
}
