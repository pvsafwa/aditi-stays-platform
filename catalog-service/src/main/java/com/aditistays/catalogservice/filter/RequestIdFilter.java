package com.aditistays.catalogservice.filter;

import java.io.IOException;
import java.security.SecureRandom;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(1)
public class RequestIdFilter extends OncePerRequestFilter implements Ordered {

    public static final String REQUEST_ID_ATTRIBUTE = "request_id";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String rid = request.getHeader("X-Request-ID");
        if (rid == null || rid.isEmpty()) {
            rid = randomRequestId();
        }
        response.setHeader("X-Request-ID", rid);
        request.setAttribute(REQUEST_ID_ATTRIBUTE, rid);
        chain.doFilter(request, response);
    }

    private static String randomRequestId() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte value : b) {
            sb.append(String.format("%02x", value));
        }
        return sb.toString();
    }

    @Override
    public int getOrder() {
        return 1;
    }
}
