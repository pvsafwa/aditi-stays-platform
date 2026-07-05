package com.aditistays.chatservice.controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import com.aditistays.chatservice.client.CrmClient;
import com.aditistays.chatservice.config.AppProperties;
import com.aditistays.chatservice.dto.AdminStatusInput;
import com.aditistays.chatservice.dto.ConfirmInput;
import com.aditistays.chatservice.dto.ShareGPayInput;
import com.aditistays.chatservice.repository.ChatRepository;
import com.aditistays.chatservice.security.ChatAccess;
import com.aditistays.chatservice.security.ChatSecurity;
import com.aditistays.chatservice.service.ChatManager;
import com.aditistays.chatservice.service.StorageService;
import com.aditistays.chatservice.service.WhatsAppService;
import com.aditistays.chatservice.web.BadRequestException;
import com.aditistays.chatservice.web.PayloadTooLargeException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class ChatRestController {

    private static final List<String> ALLOWED_IMAGE_EXTENSIONS = List.of(".jpg", ".jpeg", ".png", ".webp", ".heic");
    private static final List<String> ALLOWED_VIDEO_EXTENSIONS = List.of(".mp4", ".webm", ".mov", ".m4v", ".ogv");

    private final AppProperties props;
    private final ChatSecurity security;
    private final ChatManager chatManager;
    private final ChatRepository chatRepository;
    private final CrmClient crmClient;
    private final StorageService storageService;
    private final WhatsAppService whatsAppService;

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("ok", true);
    }

    @GetMapping("/api/chat/{leadId}/messages")
    public Map<String, Object> listMessages(@PathVariable long leadId, HttpServletRequest request) {
        security.requireChatHttpAccess(leadId, request);
        return Map.of("data", chatManager.fetchHistory(leadId));
    }

    /** Bulk last-message-per-lead lookup for crm-service's admin leads list preview. */
    @GetMapping("/api/admin/chat/last-messages")
    public Map<String, Object> lastMessages(@RequestParam("leadIds") List<Long> leadIds, HttpServletRequest request) {
        security.requireAdminHttp(request);
        Map<Long, Map<String, Object>> byLeadId = chatRepository.getLastMessages(leadIds);
        Map<String, Object> data = new LinkedHashMap<>();
        byLeadId.forEach((leadId, message) -> data.put(String.valueOf(leadId), message));
        return Map.of("data", data);
    }

    @PostMapping("/api/chat/{leadId}/share-gpay")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> shareGpay(@PathVariable long leadId, @RequestBody ShareGPayInput payload, HttpServletRequest request) {
        String adminActor = security.requireAdminHttp(request);
        String mobileNumber = payload.getMobileNumber() == null ? "" : payload.getMobileNumber().trim();
        String content = "GPay details shared. Number: " + mobileNumber + ". Please scan the QR and share payment proof here.";

        Map<String, Object> message = baseMessage(leadId, "admin", payload.getSenderLabel(), "GPAY_DETAILS", content, Map.of(
                "qr_url", nullToEmpty(payload.getQrUrl()),
                "mobile_number", nullToEmpty(payload.getMobileNumber()),
                "admin_actor", adminActor
        ));
        chatManager.broadcastEvent(leadId, message, true);
        return Map.of("ok", true, "data", message);
    }

    @PostMapping("/api/chat/{leadId}/upload-proof")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> uploadProof(@PathVariable long leadId, @RequestParam("file") MultipartFile file, HttpServletRequest request) {
        ChatAccess access = security.requireChatHttpAccess(leadId, request);

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BadRequestException("Only image uploads are supported");
        }
        long maxBytes = (long) props.maxUploadSizeMb() * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new PayloadTooLargeException("Upload exceeds " + props.maxUploadSizeMb() + "MB limit");
        }
        if (file.isEmpty()) {
            throw new BadRequestException("Uploaded file is empty");
        }

        String ext = safeImageExtension(file.getOriginalFilename());
        String filename = "proof_" + leadId + "_" + UUID.randomUUID().toString().replace("-", "") + ext;
        String fileUrl = writeFile("", filename, file, contentType);

        String uploadedBy = access.role().equals("admin") ? "admin" : "user";
        String senderLabel = uploadedBy.equals("admin") ? "Aditi Stays" : "Guest";
        if (uploadedBy.equals("user")) {
            String customerName = crmClient.getCustomerName(leadId).map(String::trim).orElse("");
            if (!customerName.isEmpty()) {
                senderLabel = customerName;
            }
        }

        chatRepository.savePaymentProof(leadId, fileUrl, uploadedBy);

        Map<String, Object> message = baseMessage(leadId, uploadedBy, senderLabel, "PAYMENT_PROOF", "Payment proof uploaded",
                Map.of("file_url", fileUrl));
        chatManager.broadcastEvent(leadId, message, true);
        return Map.of("ok", true, "data", message);
    }

    @PostMapping("/api/chat/{leadId}/confirm")
    public Map<String, Object> confirmBooking(@PathVariable long leadId, @RequestBody ConfirmInput payload, HttpServletRequest request) {
        String adminActor = security.requireAdminHttp(request);
        crmClient.confirmLead(leadId, payload.getDetails());

        Map<String, Object> message = baseMessage(leadId, "admin", payload.getSenderLabel(), "CONFIRMATION", payload.getDetails(),
                mapOfNullable("whatsapp_number", payload.getWhatsappNumber(), "admin_actor", adminActor));
        chatManager.broadcastEvent(leadId, message, true);

        boolean whatsappSent = false;
        if (payload.getWhatsappNumber() != null && !payload.getWhatsappNumber().isBlank()) {
            whatsappSent = whatsAppService.sendConfirmation(payload.getWhatsappNumber(), payload.getDetails());
        }

        return Map.of("ok", true, "whatsapp_sent", whatsappSent, "data", message);
    }

    @PostMapping("/api/chat/{leadId}/status")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> adminStatusMessage(@PathVariable long leadId, @RequestBody AdminStatusInput payload, HttpServletRequest request) {
        String adminActor = security.requireAdminHttp(request);
        Map<String, Object> message = baseMessage(leadId, "admin", payload.getSenderLabel(), "STATUS", payload.getText(),
                Map.of("admin_actor", adminActor));
        chatManager.broadcastEvent(leadId, message, true);
        return Map.of("ok", true, "data", message);
    }

    @PostMapping("/api/chat/{leadId}/auto-intro")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> autoIntroMessage(
            @PathVariable long leadId,
            @RequestParam("name") String name,
            @RequestParam("property_id") String propertyId,
            @RequestParam("from_date") String fromDate,
            @RequestParam("to_date") String toDate,
            @RequestParam("members") int members,
            HttpServletRequest request
    ) {
        ChatAccess access = security.requireChatHttpAccess(leadId, request);
        if (!access.role().equals("user")) {
            throw new com.aditistays.chatservice.security.ForbiddenException("auto intro is only available for user chat sessions");
        }

        String cleanName = name == null ? "" : name.trim();
        String cleanProperty = propertyId == null ? "" : propertyId.trim();
        String cleanFrom = fromDate == null ? "" : fromDate.trim();
        String cleanTo = toDate == null ? "" : toDate.trim();
        if (cleanName.isEmpty() || cleanProperty.isEmpty() || cleanFrom.isEmpty() || cleanTo.isEmpty()) {
            throw new BadRequestException("name, property_id, from_date and to_date are required");
        }
        if (members <= 0) {
            throw new BadRequestException("members should be greater than 0");
        }

        String text = "Hi, I am " + cleanName + ". I would like to know the availability of " + cleanProperty
                + " from " + cleanFrom + " to " + cleanTo + " for " + members + " member(s).";

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("property_id", cleanProperty);
        metadata.put("from_date", cleanFrom);
        metadata.put("to_date", cleanTo);
        metadata.put("members", members);

        Map<String, Object> message = baseMessage(leadId, "user", cleanName, "TRIP_REQUIREMENT", text, metadata);
        chatManager.broadcastEvent(leadId, message, true);

        CompletableFuture.runAsync(() -> sendDelayedAutoIntroReply(leadId, cleanName),
                CompletableFuture.delayedExecutor(3, TimeUnit.SECONDS));

        return Map.of("ok", true, "data", message);
    }

    private void sendDelayedAutoIntroReply(long leadId, String cleanName) {
        try {
            String text = "Thank you for reaching out to Aditi Stays, " + cleanName + ". "
                    + "We are currently checking availability with the property for your requested dates. "
                    + "Please wait while we get back to you.";
            Map<String, Object> message = baseMessage(leadId, "admin", "Aditi Stays", "AUTO_RESPONSE", text, Map.of("auto_reply", true));
            chatManager.broadcastEvent(leadId, message, true);
        } catch (Exception ignored) {
            // Do not fail the request path if the delayed auto reply fails.
        }
    }

    @PostMapping("/api/admin/banners/upload")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> uploadBannerVideo(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "quality", defaultValue = "1080p") String quality,
            @RequestParam(value = "bitrate_kbps", defaultValue = "6000") int bitrateKbps,
            HttpServletRequest request
    ) {
        String adminActor = security.requireAdminHttp(request);

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("video/")) {
            throw new BadRequestException("Only video uploads are supported");
        }
        String ext = extensionOf(file.getOriginalFilename());
        if (!ALLOWED_VIDEO_EXTENSIONS.contains(ext)) {
            throw new BadRequestException("Unsupported video format");
        }
        long maxBytes = (long) props.bannerMaxUploadSizeMb() * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new PayloadTooLargeException("Upload exceeds " + props.bannerMaxUploadSizeMb() + "MB limit");
        }
        if (file.isEmpty()) {
            throw new BadRequestException("Uploaded file is empty");
        }

        String filename = "banner_" + UUID.randomUUID().toString().replace("-", "") + ext;
        String fileUrl = writeFile("banners", filename, file, contentType);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", fileUrl);
        data.put("quality", quality);
        data.put("bitrate_kbps", bitrateKbps);
        data.put("mime_type", contentType);
        data.put("file_name", file.getOriginalFilename() == null ? filename : file.getOriginalFilename());
        data.put("uploaded_by", adminActor);
        return Map.of("ok", true, "data", data);
    }

    @PostMapping("/api/admin/properties/upload-image")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> uploadPropertyImage(@RequestParam("file") MultipartFile file, HttpServletRequest request) {
        String adminActor = security.requireAdminHttp(request);

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BadRequestException("Only image uploads are supported");
        }
        long maxBytes = (long) props.maxUploadSizeMb() * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new PayloadTooLargeException("Upload exceeds " + props.maxUploadSizeMb() + "MB limit");
        }
        if (file.isEmpty()) {
            throw new BadRequestException("Uploaded file is empty");
        }

        String ext = safeImageExtension(file.getOriginalFilename());
        String filename = "property_" + UUID.randomUUID().toString().replace("-", "") + ext;
        String fileUrl = writeFile("properties", filename, file, contentType);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", fileUrl);
        data.put("mime_type", contentType);
        data.put("file_name", file.getOriginalFilename() == null ? filename : file.getOriginalFilename());
        data.put("uploaded_by", adminActor);
        return Map.of("ok", true, "data", data);
    }

    private String writeFile(String subdir, String filename, MultipartFile file, String contentType) {
        try {
            return storageService.store(subdir, filename, file.getBytes(), contentType);
        } catch (java.io.IOException e) {
            throw new RuntimeException("failed to read uploaded file", e);
        }
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int idx = filename.lastIndexOf('.');
        return idx >= 0 ? filename.substring(idx).toLowerCase() : "";
    }

    private static String safeImageExtension(String filename) {
        String ext = extensionOf(filename);
        return ALLOWED_IMAGE_EXTENSIONS.contains(ext) ? ext : ".jpg";
    }

    private static Map<String, Object> baseMessage(long leadId, String senderRole, String senderLabel, String messageType,
                                                     String content, Map<String, Object> metadata) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("event", "message");
        message.put("lead_id", leadId);
        message.put("sender_role", senderRole);
        message.put("sender_label", senderLabel);
        message.put("message_type", messageType);
        message.put("content", content);
        message.put("metadata", metadata);
        message.put("created_at", Instant.now().toString());
        return message;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static Map<String, Object> mapOfNullable(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        m.put(k2, v2);
        return m;
    }
}
