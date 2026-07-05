package com.aditistays.chatservice.dto;

import lombok.Data;

@Data
public class ShareGPayInput {
    private String senderLabel = "Admin";
    private String qrUrl;
    private String mobileNumber;
}
