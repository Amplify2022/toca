# Multi-stage build; first execution downloads Gradle dependencies from Maven Central.
FROM gradle:8.14-jdk21 AS builder
WORKDIR /workspace
COPY --chown=gradle:gradle . .
RUN gradle --no-daemon clean test installDist

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S toca && adduser -S -G toca toca
COPY --from=builder /workspace/build/install/amplify-api/ /app/
USER toca
EXPOSE 8080
ENTRYPOINT ["/app/bin/amplify-api"]
