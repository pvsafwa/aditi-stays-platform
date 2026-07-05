package com.aditistays.coreapi.controller;

import com.aditistays.coreapi.filter.MetricsCollector;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MetricsController {

    private final MetricsCollector metrics;

    @GetMapping(value = "/metrics", produces = "text/plain; version=0.0.4")
    public String metrics() {
        return metrics.prometheusText();
    }
}
