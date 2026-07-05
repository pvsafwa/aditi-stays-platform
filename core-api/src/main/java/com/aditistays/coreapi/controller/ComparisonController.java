package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.dto.Requests.ComparisonRequest;
import com.aditistays.coreapi.service.CatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/comparisons")
@RequiredArgsConstructor
public class ComparisonController {

    private final CatalogService catalogService;

    @PostMapping
    public Map<String, Object> compareProperties(@RequestBody ComparisonRequest in) {
        return Map.of("data", catalogService.compareProperties(in.getPropertyIds()));
    }
}
