package com.aditistays.chatservice.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

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

    @Bean
    public CorsFilter corsFilter() {
        List<String> origins = props.corsAllowedOrigins();
        boolean allowAll = origins.contains("*");

        CorsConfiguration config = new CorsConfiguration();
        if (allowAll) {
            config.addAllowedOriginPattern("*");
            config.setAllowCredentials(false);
        } else {
            List<String> effective = origins.isEmpty() ? List.of("http://localhost:3000") : origins;
            config.setAllowedOrigins(effective);
            config.setAllowCredentials(true);
        }
        config.addAllowedMethod("*");
        config.addAllowedHeader("*");

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
