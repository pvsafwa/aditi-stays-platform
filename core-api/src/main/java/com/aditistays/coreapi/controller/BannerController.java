package com.aditistays.coreapi.controller;

import java.util.Map;

import com.aditistays.coreapi.repository.BannerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/banners")
@RequiredArgsConstructor
public class BannerController {

    private final BannerRepository bannerRepository;

    @GetMapping
    public Map<String, Object> listBanners() {
        return Map.of("data", bannerRepository.listActiveBanners());
    }
}
