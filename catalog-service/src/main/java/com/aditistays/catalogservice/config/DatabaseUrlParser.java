package com.aditistays.catalogservice.config;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * Converts the Go-style DATABASE_URL (postgres://user:pass@host:port/db?opts)
 * into a JDBC URL + credentials, so the README's existing env var format
 * keeps working unchanged with the Java service.
 */
public final class DatabaseUrlParser {

    public record Parsed(String jdbcUrl, String username, String password) {
    }

    private DatabaseUrlParser() {
    }

    public static Parsed parse(String databaseUrl) {
        try {
            URI uri = new URI(databaseUrl);
            String username = null;
            String password = null;
            String userInfo = uri.getUserInfo();
            if (userInfo != null) {
                int idx = userInfo.indexOf(':');
                if (idx >= 0) {
                    username = userInfo.substring(0, idx);
                    password = userInfo.substring(idx + 1);
                } else {
                    username = userInfo;
                }
            }

            StringBuilder jdbc = new StringBuilder("jdbc:postgresql://");
            jdbc.append(uri.getHost());
            if (uri.getPort() > 0) {
                jdbc.append(':').append(uri.getPort());
            }
            jdbc.append(uri.getPath());
            if (uri.getQuery() != null) {
                jdbc.append('?').append(uri.getQuery());
            }

            return new Parsed(jdbc.toString(), username, password);
        } catch (URISyntaxException e) {
            throw new IllegalStateException("invalid DATABASE_URL: " + e.getMessage(), e);
        }
    }
}
