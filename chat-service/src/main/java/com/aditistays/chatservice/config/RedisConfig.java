package com.aditistays.chatservice.config;

import io.lettuce.core.RedisURI;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
public class RedisConfig {

    @Bean
    public LettuceConnectionFactory redisConnectionFactory(AppProperties props) {
        RedisURI redisUri = RedisURI.create(props.redisUrl());

        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration(redisUri.getHost(), redisUri.getPort());
        config.setDatabase(redisUri.getDatabase());
        if (redisUri.getPassword() != null) {
            config.setPassword(String.valueOf(redisUri.getPassword()));
        }
        return new LettuceConnectionFactory(config);
    }

    @Bean
    public StringRedisTemplate redisTemplate(LettuceConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(LettuceConnectionFactory connectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        return container;
    }
}
