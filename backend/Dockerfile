# syntax=docker/dockerfile:1
FROM gradle:8.14-jdk21@sha256:aa72246029828dd4b4ddb5d4aba31f72ee070cafe52dc85ad5cc3296007ace6f AS builder
WORKDIR /workspace
COPY --chown=gradle:gradle build.gradle.kts settings.gradle.kts gradle.lockfile ./
COPY --chown=gradle:gradle src ./src
RUN --mount=type=cache,target=/home/gradle/.gradle,uid=1000,gid=1000 gradle --no-daemon test installDist
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S toca && adduser -S -G toca toca
COPY --from=builder /workspace/build/install/amplify-api/ /app/
USER toca
EXPOSE 8080
ENTRYPOINT ["/app/bin/amplify-api"]
