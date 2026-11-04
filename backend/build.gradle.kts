plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.kotlin.kapt") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.allopen") version "2.0.21"
    id("io.micronaut.application") version "4.5.4"
}

version = "0.1.0"
group = "com.amplify"
repositories { mavenCentral() }

micronaut {
    version("4.8.2")
    runtime("netty")
    testRuntime("junit5")
    processing {
        incremental(true)
        annotations("com.amplify.api.*")
    }
}

allOpen {
    annotation("io.micronaut.http.annotation.Controller")
    annotation("jakarta.inject.Singleton")
}

application { mainClass.set("com.amplify.api.ApplicationKt") }
java { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }
kotlin { jvmToolchain(21) }

dependencyLocking { lockAllConfigurations() }

dependencies {
    implementation("org.eclipse.angus:jakarta.mail:2.0.3")
    implementation("com.google.api-client:google-api-client:2.9.2")
    kapt("io.micronaut:micronaut-inject-java")
    implementation("io.micronaut.kotlin:micronaut-kotlin-runtime")
    implementation("io.micronaut:micronaut-http-server-netty")
    implementation("io.micronaut:micronaut-jackson-databind")
    implementation("io.micronaut.sql:micronaut-jdbc-hikari")
    implementation("io.micronaut.flyway:micronaut-flyway")
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation("org.mindrot:jbcrypt:0.4")
    implementation("ch.qos.logback:logback-classic:1.5.12")
    // Micronaut 4 YAML config, Flyway 10+ PostgreSQL support, Jackson Kotlin reflection.
    implementation(kotlin("reflect"))
    runtimeOnly("org.yaml:snakeyaml")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql:42.7.4")
    testImplementation("org.junit.jupiter:junit-jupiter-api")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine")
}

tasks.withType<Test> { useJUnitPlatform() }
