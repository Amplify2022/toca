package com.amplify.api
fun main(){
 val flyway=org.flywaydb.core.Flyway.configure().dataSource(System.getenv("JDBC_URL"),System.getenv("DB_USERNAME"),System.getenv("DB_PASSWORD")).locations("classpath:db/migration").load()
 flyway.migrate()
 flyway.configuration.dataSource.connection.use{c->c.createStatement().use{s->
  s.execute("DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='toca_app') THEN REVOKE ALL ON TABLE flyway_schema_history FROM toca_app; END IF; END $$")
 }}
}
