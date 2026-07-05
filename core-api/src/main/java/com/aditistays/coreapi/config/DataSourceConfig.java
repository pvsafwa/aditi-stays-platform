package com.aditistays.coreapi.config;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(AppProperties props) {
        DatabaseUrlParser.Parsed parsed = DatabaseUrlParser.parse(props.databaseUrl());

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(parsed.jdbcUrl());
        if (parsed.username() != null) {
            config.setUsername(parsed.username());
        }
        if (parsed.password() != null) {
            config.setPassword(parsed.password());
        }
        config.setMaximumPoolSize(15);
        config.setPoolName("core-api-pool");
        return new HikariDataSource(config);
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
