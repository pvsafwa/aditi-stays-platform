package com.aditistays.crmservice.outbox;

import com.aditistays.crmservice.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Polls outbox_events for rows a business transaction wrote but hasn't been
 * published to Redis yet, and publishes+marks them. This is what makes event
 * delivery at-least-once across a crash: the business write and the outbox
 * insert commit atomically in the same DB transaction (see LeadService), so a
 * crash between "wrote to Postgres" and "published to Redis" just leaves an
 * unpublished row for the next poll to pick up on restart -- nothing is lost.
 */
@Component
@RequiredArgsConstructor
public class OutboxRelay {

    private static final int BATCH_SIZE = 100;

    private final OutboxRepository outboxRepository;
    private final StringRedisTemplate redisTemplate;
    private final AppProperties props;

    @Scheduled(fixedDelay = 500)
    public void relay() {
        for (OutboxEvent event : outboxRepository.fetchUnpublished(BATCH_SIZE)) {
            redisTemplate.convertAndSend(props.chatNotificationChannel(), event.payload());
            outboxRepository.markPublished(event.id());
        }
    }
}
