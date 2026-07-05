package com.aditistays.chatservice.dto;

import lombok.Data;

@Data
public class AdminStatusInput {
    private String senderLabel = "Admin";
    private String text;
}
