package com.aditistays.chatservice.dto;

import lombok.Data;

@Data
public class ConfirmInput {
    private String senderLabel = "Admin";
    private String details = "Confirmed";
    private String whatsappNumber;
}
