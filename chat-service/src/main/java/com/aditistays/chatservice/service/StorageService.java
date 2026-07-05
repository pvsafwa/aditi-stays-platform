package com.aditistays.chatservice.service;

import java.nio.file.Files;
import java.nio.file.Path;

import com.aditistays.chatservice.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.net.URI;

/** Mirrors chat-service's Python local/S3 upload helpers in app/api/routes.py. */
@Service
@RequiredArgsConstructor
public class StorageService {

    private final AppProperties props;

    /** Stores a file and returns its publicly reachable URL. subdir may be "" for the upload root. */
    @SneakyThrows
    public String store(String subdir, String filename, byte[] data, String contentType) {
        if (props.storageBackend().equals("s3")) {
            String prefix = trimSlashes(props.s3Prefix());
            if (prefix.isEmpty()) {
                prefix = "payment-proofs";
            }
            String key = subdir.isEmpty() ? prefix + "/" + filename : prefix + "/" + subdir + "/" + filename;
            return uploadToS3(key, data, contentType);
        }

        Path dir = subdir.isEmpty() ? Path.of(props.uploadDir()) : Path.of(props.uploadDir(), subdir);
        Files.createDirectories(dir);
        Path path = dir.resolve(filename);
        Files.write(path, data);

        String urlSubdir = subdir.isEmpty() ? "" : "/" + subdir;
        return trimTrailingSlash(props.publicBaseUrl()) + "/uploads" + urlSubdir + "/" + filename;
    }

    private String uploadToS3(String key, byte[] data, String contentType) {
        if (props.s3Bucket().isBlank()) {
            throw new IllegalStateException("S3_BUCKET is required for s3 storage backend");
        }

        var builder = S3Client.builder();
        builder.region(Region.of(props.s3Region().isBlank() ? "us-east-1" : props.s3Region()));
        if (!props.s3EndpointUrl().isBlank()) {
            builder.endpointOverride(URI.create(props.s3EndpointUrl()));
        }

        try (S3Client client = builder.build()) {
            client.putObject(
                    PutObjectRequest.builder().bucket(props.s3Bucket()).key(key).contentType(contentType).build(),
                    RequestBody.fromBytes(data));
        }

        String publicBase = trimTrailingSlash(props.s3PublicBaseUrl());
        if (!publicBase.isEmpty()) {
            return publicBase + "/" + key;
        }

        String region = props.s3Region().isBlank() ? "us-east-1" : props.s3Region();
        if (region.equals("us-east-1")) {
            return "https://" + props.s3Bucket() + ".s3.amazonaws.com/" + key;
        }
        return "https://" + props.s3Bucket() + ".s3." + region + ".amazonaws.com/" + key;
    }

    private static String trimTrailingSlash(String s) {
        String v = s == null ? "" : s.trim();
        while (v.endsWith("/")) {
            v = v.substring(0, v.length() - 1);
        }
        return v;
    }

    private static String trimSlashes(String s) {
        String v = s == null ? "" : s.trim();
        while (v.startsWith("/")) {
            v = v.substring(1);
        }
        return trimTrailingSlash(v);
    }
}
