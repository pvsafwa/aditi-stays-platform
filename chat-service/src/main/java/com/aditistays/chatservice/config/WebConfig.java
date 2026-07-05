package com.aditistays.chatservice.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** CORS is centralized at the gateway now; this service no longer configures it directly. */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;

    @PostConstruct
    public void ensureUploadDir() throws IOException {
        if (props.storageBackend().equals("local")) {
            Files.createDirectories(Path.of(props.uploadDir()));
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String dir = props.uploadDir();
        String location = dir.endsWith("/") ? "file:" + dir : "file:" + dir + "/";
        registry.addResourceHandler("/uploads/**").addResourceLocations(location);
    }
}
