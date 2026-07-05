package com.aditistays.coreapi.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import com.aditistays.coreapi.dto.Requests.CheckAvailabilityRequest;
import com.aditistays.coreapi.model.Lead;
import com.aditistays.coreapi.service.LeadService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/leads")
@RequiredArgsConstructor
public class LeadController {

    private static final String COMPLIANCE_NOTICE = "Chat will be recorded for internal training purposes & compliance.";

    private final LeadService leadService;

    @PostMapping("/check-availability")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> checkAvailability(@RequestBody CheckAvailabilityRequest in) {
        LeadService.LeadResult result = leadService.createOrReuseLead(
                in.getVisitorId(), in.getPropertyId(), in.getCustomerName(), in.getMobileNumber(), in.isDisclaimerAccepted());
        Lead lead = result.lead();

        String chatToken;
        try {
            chatToken = leadService.generateUserChatToken(lead.getId());
        } catch (Exception e) {
            throw new RuntimeException("unable to create chat token", e);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("data", lead);
        body.put("resumed_chat", result.resumed());
        body.put("chat_id", lead.getId());
        body.put("chat_token", chatToken);
        body.put("notice", COMPLIANCE_NOTICE);
        body.put("recording_notice", COMPLIANCE_NOTICE);
        return body;
    }
}
