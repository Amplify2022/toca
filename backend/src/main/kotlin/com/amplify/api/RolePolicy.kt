package com.amplify.api

import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.util.UUID

/** RBAC backed by explicit grants; never infer elevated access from email. */
@Singleton
class RolePolicy(private val db: Db) {
    fun forAdmin(id: UUID): List<String> = db.list(
        "SELECT role FROM account_role WHERE admin_user_id=? ORDER BY role", id
    ).map { it.getValue("role").toString() }

    fun forCustomer(id: UUID): List<String> = db.list(
        "SELECT role FROM account_role WHERE customer_id=? ORDER BY role", id
    ).map { it.getValue("role").toString() }

    fun requireVenueAdmin(id: UUID) {
        if ("VENUE_ADMIN" !in forAdmin(id))
            fail(HttpStatus.FORBIDDEN, "La cuenta no tiene el rol VENUE_ADMIN")
    }

    fun requireCustomer(id: UUID) {
        if ("CUSTOMER" !in forCustomer(id))
            fail(HttpStatus.FORBIDDEN, "La cuenta no tiene el rol CUSTOMER")
    }

    fun grantVenueAdmin(id: UUID) {
        db.exec("""INSERT INTO account_role(admin_user_id,role) VALUES(?,'VENUE_ADMIN')
            ON CONFLICT DO NOTHING""",id)
    }
    fun grantCustomer(id: UUID) {
        db.exec("""INSERT INTO account_role(customer_id,role) VALUES(?,'CUSTOMER')
            ON CONFLICT DO NOTHING""",id)
    }
}
