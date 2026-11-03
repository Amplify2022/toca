package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

class DbTransactionTest {
    private class Pool {
        val borrowed = AtomicInteger()
        val closed = AtomicInteger()
        val commits = AtomicInteger()
        val rollbacks = AtomicInteger()
        val source = proxy(DataSource::class.java) { method ->
            when (method) {
                "getConnection" -> {
                    borrowed.incrementAndGet()
                    proxy(Connection::class.java) { operation ->
                        when (operation) {
                            "getAutoCommit" -> true
                            "setAutoCommit" -> null
                            "prepareStatement" -> proxy(PreparedStatement::class.java) {
                                if (it == "executeUpdate") 1 else null
                            }
                            "commit" -> { commits.incrementAndGet(); null }
                            "rollback" -> { rollbacks.incrementAndGet(); null }
                            "close" -> { closed.incrementAndGet(); null }
                            else -> null
                        }
                    }
                }
                else -> null
            }
        }
    }

    @Test fun `nested services borrow just one connection and close after commit`() {
        val pool = Pool(); val db = Db(pool.source)
        db.transaction { outer ->
            db.exec("UPDATE fixture SET value=1")
            db.transaction { inner ->
                assertSame(outer, inner)
                db.exec("UPDATE fixture SET value=2")
            }
            assertEquals(1, pool.borrowed.get())
            assertEquals(0, pool.closed.get())
        }
        assertEquals(1, pool.commits.get())
        assertEquals(1, pool.closed.get())
        db.exec("UPDATE fixture SET value=3")
        assertEquals(2, pool.borrowed.get())
        assertEquals(2, pool.closed.get())
    }

    @Test fun `caught nested failure still prevents outer commit and clears context`() {
        val pool = Pool(); val db = Db(pool.source)
        assertThrows(IllegalStateException::class.java) {
            db.transaction {
                try { db.transaction<Unit> { error("nested failure") } }
                catch (_: IllegalStateException) { /* caller cannot turn this into a commit */ }
                db.exec("UPDATE fixture SET value=1")
            }
        }
        assertEquals(0, pool.commits.get())
        assertEquals(1, pool.rollbacks.get())
        assertEquals(1, pool.closed.get())
        db.transaction { db.exec("UPDATE fixture SET value=2") }
        assertEquals(2, pool.borrowed.get())
        assertEquals(1, pool.commits.get())
    }

    @Test fun `concurrent transactions do not share connection contexts`() {
        val pool = Pool(); val db = Db(pool.source)
        val entered = CountDownLatch(2)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val jobs = (1..2).map {
                executor.submit {
                    db.transaction { outer ->
                        entered.countDown()
                        assertTrue(entered.await(5, TimeUnit.SECONDS))
                        db.transaction { assertSame(outer, it) }
                        db.exec("UPDATE fixture SET value=1")
                    }
                }
            }
            jobs.forEach { it.get(10, TimeUnit.SECONDS) }
            assertEquals(2, pool.borrowed.get())
            assertEquals(2, pool.commits.get())
            assertEquals(2, pool.closed.get())
        } finally { executor.shutdownNow() }
    }

    companion object {
        private fun <T> proxy(type: Class<T>, handler: (String) -> Any?): T = type.cast(
            Proxy.newProxyInstance(type.classLoader, arrayOf(type)) { _, method, _ -> handler(method.name) }
        )
    }
}
