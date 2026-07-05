package com.aditistays.chatservice.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

import com.aditistays.chatservice.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;

/** Mirrors chat-service's Python app/services/whatsapp.py. */
@Service
@RequiredArgsConstructor
public class WhatsAppService {

    private final AppProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public boolean sendConfirmation(String phone, String body) {
        if (phone == null || phone.isBlank()) {
            return false;
        }
        return switch (props.whatsappProvider()) {
            case "twilio" -> sendTwilio(phone, body);
            case "meta" -> sendMeta(phone, body);
            default -> {
                System.out.printf("[whatsapp:stub] %s <- %s%n", phone, body);
                yield false;
            }
        };
    }

    private static String normalizePhone(String phone) {
        String cleaned = phone.trim().replace(" ", "");
        return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
    }

    @SneakyThrows
    private boolean sendTwilio(String phone, String body) {
        if (props.twilioAccountSid().isEmpty() || props.twilioAuthToken().isEmpty() || props.twilioWhatsappFrom().isEmpty()) {
            System.out.println("[whatsapp] twilio credentials missing");
            return false;
        }

        String url = "https://api.twilio.com/2010-04-01/Accounts/" + props.twilioAccountSid() + "/Messages.json";
        String form = "To=" + URLEncoder.encode("whatsapp:" + normalizePhone(phone), StandardCharsets.UTF_8)
                + "&From=" + URLEncoder.encode("whatsapp:" + normalizePhone(props.twilioWhatsappFrom()), StandardCharsets.UTF_8)
                + "&Body=" + URLEncoder.encode(body, StandardCharsets.UTF_8);

        String credentials = Base64.getEncoder().encodeToString(
                (props.twilioAccountSid() + ":" + props.twilioAuthToken()).getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Basic " + credentials)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            System.out.printf("[whatsapp] twilio failed: %d %s%n", response.statusCode(), response.body());
            return false;
        }
        return true;
    }

    @SneakyThrows
    private boolean sendMeta(String phone, String body) {
        if (props.metaWhatsappToken().isEmpty() || props.metaPhoneNumberId().isEmpty()) {
            System.out.println("[whatsapp] meta credentials missing");
            return false;
        }

        String url = "https://graph.facebook.com/v21.0/" + props.metaPhoneNumberId() + "/messages";
        var payload = new java.util.LinkedHashMap<String, Object>();
        payload.put("messaging_product", "whatsapp");
        payload.put("to", normalizePhone(phone));
        payload.put("type", "text");
        payload.put("text", java.util.Map.of("body", body));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + props.metaWhatsappToken())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            System.out.printf("[whatsapp] meta failed: %d %s%n", response.statusCode(), response.body());
            return false;
        }
        return true;
    }
}
