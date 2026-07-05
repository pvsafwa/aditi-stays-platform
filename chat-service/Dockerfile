# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /build/target/chat-service-0.1.0.jar app.jar
RUN mkdir -p /app/uploads && chown app:app /app/uploads
USER app
EXPOSE 8000
VOLUME ["/app/uploads"]
ENTRYPOINT ["java", "-jar", "app.jar"]
