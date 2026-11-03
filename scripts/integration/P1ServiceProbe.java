import com.amplify.api.*;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.exceptions.HttpStatusException;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Local fixtures only: real Db/PostgreSQL + deterministic fake Spotify gateway.
 * Compile against the rebuilt app distribution, never run against production.
 */
public class P1ServiceProbe {
    static final List<UUID> owners = new ArrayList<>(), customers = new ArrayList<>();
    static Db db;
    static HikariDataSource datasource;
    static String marker = "p1-" + UUID.randomUUID();
    static int assertions;
    static void check(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }
    static void forbidden(Runnable operation, HttpStatus status, String message) {
        try { operation.run(); throw new AssertionError(message + " (accepted)"); }
        catch (HttpStatusException expected) { check(expected.getStatus() == status, message + " (wrong status)"); }
    }
    static UUID customer() {
        UUID id = UUID.randomUUID();customers.add(id);
        db.exec("INSERT INTO customer_account(id,name,email,password_hash) VALUES(?,?,?,?)",
            id, "P1 fixture", marker + "-" + id + "@example.test", "unused-test-hash");
        db.exec("INSERT INTO account_role(customer_id,role) VALUES(?,'CUSTOMER')", id);
        return id;
    }
    static UUID venue() {
        UUID owner = UUID.randomUUID();owners.add(owner);
        db.exec("INSERT INTO admin_user(id,name,email,password_hash) VALUES(?,?,?,?)",
            owner, "P1 fixture", marker + "-" + owner + "@example.test", "unused-test-hash");
        UUID id = UUID.randomUUID();
        db.exec("""
            INSERT INTO venue(id,owner_id,name,slug,address,city,latitude,longitude,join_token,
                active,spotify_premium,spotify_access_encrypted,playlist_id,request_access_mode,queue_started_at)
            VALUES(?,?,?,?,?,?,?, ?,?, true,true,?,'p1-playlist','ANYWHERE',now()-interval '1 minute')
            """, id, owner, "P1 test", marker + id, "Test", "Test", -34.90, -56.17,
            "qr-"+UUID.randomUUID(), "fixture-not-a-real-token");
        return id;
    }
    static Map<String,Object> body(String track, String guest) {
        return Map.of("trackId", track, "guestId", guest);
    }
    static String key() { return UUID.randomUUID().toString(); }
    static final String TRACK_A="AAAAAAAAAAAAAAAAAAAAAA", TRACK_B="BBBBBBBBBBBBBBBBBBBBBB";

    static void transactionReuse() throws Exception {
        db.transaction(connection -> {
            try {
                int direct;
                try(var s=connection.createStatement();var rs=s.executeQuery("SELECT pg_backend_pid()")) {
                    rs.next();direct=rs.getInt(1);
                }
                var nested=db.one("SELECT pg_backend_pid() AS pid");
                check(((Number)nested.get("pid")).intValue()==direct,"Nested query borrowed another connection");
                return null;
            } catch(SQLException error) { throw new RuntimeException(error); }
        });
        var workers=Executors.newFixedThreadPool(8);
        var acquired=new CountDownLatch(8);
        var futures=new ArrayList<Future<?>>();
        try {
            for(int i=0;i<8;i++) futures.add(workers.submit(()->db.transaction(connection->{
                acquired.countDown();
                try {
                    if(!acquired.await(5,TimeUnit.SECONDS))throw new AssertionError("Pool fixture did not acquire 8 connections");
                    try(var s=connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
                        s.setString(1,marker);s.execute();
                    }
                    db.one("SELECT 1 AS value");
                    return null;
                } catch(Exception error) {throw new RuntimeException(error);}
            })));
            for(var f:futures)f.get(15,TimeUnit.SECONDS);
            check(true,"All 8 nested transaction workers must complete");
        } finally {workers.shutdownNow();}
        System.out.println("PASS Db: same transaction connection and 8 concurrent lock waiters complete");
    }

    static void presenceEvidence() {
        UUID v=venue(), c=customer();
        var presence=new VenuePresence(db);
        db.exec("UPDATE venue SET request_access_mode='NEARBY' WHERE id=?",v);
        Map<String,Object> gps=Map.of("latitude",-34.90,"longitude",-56.17,"accuracy",1);
        forbidden(()->presence.checkIn(v,c,gps,""),HttpStatus.FORBIDDEN,"Client GPS without QR must fail");
        check(!Boolean.TRUE.equals(presence.status(v,c).get("allowed")),"No QR must not grant presence");
        String qr=(String)db.one("SELECT join_token FROM venue WHERE id=?",v).get("join_token");
        check(Boolean.TRUE.equals(presence.checkIn(v,c,gps,qr).get("allowed")),"Current QR plus GPS must grant");
        db.exec("UPDATE venue SET join_token=? WHERE id=?","rotated-"+UUID.randomUUID(),v);
        check(!Boolean.TRUE.equals(presence.status(v,c).get("allowed")),"Rotating QR must revoke old grant");
        forbidden(()->presence.checkIn(v,c,gps,qr),HttpStatus.FORBIDDEN,"Old QR must not regrant");
        db.exec("UPDATE venue SET request_access_mode='ANYWHERE' WHERE id=?",v);
        check(Boolean.TRUE.equals(presence.checkIn(v,c,Map.of(),"").get("allowed")),"Explicit ANYWHERE remains available");
        System.out.println("PASS presence: GPS alone refused, QR accepted, rotation revokes, ANYWHERE explicit");
    }

    static class FakeSpotify implements RequestSpotifyGateway {
        final AtomicInteger metadataCalls=new AtomicInteger(),applyCalls=new AtomicInteger();
        Runnable duringMetadata=()->{};
        boolean failAfterEffect;
        boolean crashAfterEffect;
        final Set<String> appliedPlans=new HashSet<>();
        int effects;
        @Override public boolean getEnabled(){return true;}
        @Override public Map<String,String> metadata(UUID venue,String track) {
            metadataCalls.incrementAndGet();duringMetadata.run();
            return Map.of("id",track,"title","Fixture song","artist","Fixture artist");
        }
        @Override public String token(UUID venue){return "mock-token";}
        @Override public String prepare(UUID venue,String track,String token,List<String> order,String playlist) {
            return "{\"fixturePlan\":\""+venue+":"+track+"\"}";
        }
        @Override public RequestPlaylistResult apply(UUID venue,String token,String plan) {
            applyCalls.incrementAndGet();
            var durable=db.one("SELECT status,plan_json FROM request_command WHERE venue_id=? ORDER BY sequence DESC LIMIT1".replace("LIMIT1","LIMIT 1"),venue);
            check(durable!=null && plan.equals(durable.get("plan_json")),"Plan must be durably saved before remote effect");
            if(appliedPlans.add(plan)) effects++;
            if(crashAfterEffect){crashAfterEffect=false;throw new AssertionError("simulated worker death after remote effect");}
            if(failAfterEffect){failAfterEffect=false;throw new RuntimeException("simulated timeout after remote success");}
            return new RequestPlaylistResult("fixture-synchronized",1,null);
        }
        @Override public RequestPlaylistResult verify(UUID venue,String token,String plan) {
            return appliedPlans.contains(plan) ? new RequestPlaylistResult("fixture-synchronized",1,null) : null;
        }
    }

    static void requestIdentityAndReplay() {
        UUID v=venue(), c=customer(), other=customer();var fake=new FakeSpotify();
        var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
        String idem=key();
        var first=commands.submit(v,c,body(TRACK_A,"guest-original"),idem);
        var replay=commands.submit(v,c,body(TRACK_A,"guest-rotated"),idem);
        check(Objects.equals(first.get("commandId"),replay.get("commandId")),"Same key must return same command");
        int callsBefore=fake.metadataCalls.get();
        forbidden(()->commands.submit(v,c,body(TRACK_B,"guest-another"),key()),HttpStatus.TOO_MANY_REQUESTS,"Guest rotation must not evade customer cooldown");
        check(fake.metadataCalls.get()==callsBefore,"Rate rejection must run before additional provider work");
        commands.submit(v,other,body(TRACK_B,"guest-different"),key());
        check(((Number)db.one("SELECT count(*) AS n FROM request_command WHERE venue_id=?",v).get("n")).intValue()==2,"Different authenticated customers retain separate quotas");
        commands.processVenue(v);
        check(fake.effects>0,"Worker should synchronize at least one accepted command");
        int effects=fake.effects;commands.processVenue(v);
        check(fake.effects<=2,"Completed command must not duplicate effect");
        forbidden(()->commands.submit(v,c,body(TRACK_B,"guest-key-conflict"),idem),HttpStatus.CONFLICT,"Same key cannot refer to another track");
        System.out.println("PASS requests: authenticated limit, cheap rejection, idempotency and durable plan before effect");
    }

    static void authenticatedWindowCap() {
        UUID v=venue(), c=customer();var fake=new FakeSpotify();
        var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
        for(int i=0;i<6;i++) {
            commands.submit(v,c,body(TRACK_A,"guest-window-"+i),key());
            db.exec("UPDATE request_command SET created_at=now()-interval '20 seconds' WHERE venue_id=?",v);
        }
        int calls=fake.metadataCalls.get();
        forbidden(()->commands.submit(v,c,body(TRACK_B,"guest-window-rotated"),key()),HttpStatus.TOO_MANY_REQUESTS,"Seventh authenticated request must hit 10 minute cap");
        check(fake.metadataCalls.get()==calls,"Window cap must reject before remote work");
        System.out.println("PASS requests: six-per-window cap remains bound to authenticated customer");
    }

    static void policyRevalidation() {
        for(String change:List.of("active=false","curated_only=true")) {
            UUID v=venue(),c=customer();var fake=new FakeSpotify();
            fake.duringMetadata=()->db.exec("UPDATE venue SET "+change+" WHERE id=?",v);
            var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
            commands.submit(v,c,body(TRACK_A,"guest-policy-race"),key());
            commands.processVenue(v);
            check(fake.applyCalls.get()==0,"Closed session/new whitelist must reject before remote effect: "+change);
            var state=db.one("SELECT status FROM request_command WHERE venue_id=?",v);
            check(!"SUCCEEDED".equals(state.get("status")),"Rejected policy command cannot report success");
        }
        System.out.println("PASS requests: close/whitelist during metadata invalidates stale acceptance");
    }

    static void uncertainRemoteEffect() {
        UUID v=venue(),c=customer();var fake=new FakeSpotify();fake.failAfterEffect=true;
        var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
        String idem=key();commands.submit(v,c,body(TRACK_A,"guest-uncertain"),idem);
        commands.processVenue(v);
        var command=db.one("SELECT status,plan_json FROM request_command WHERE venue_id=?",v);
        check(command.get("plan_json")!=null,"Unknown remote result must retain recovery plan");
        check(!"SUCCEEDED".equals(command.get("status")),"Unknown result must not claim success");
        int effects=fake.effects;
        commands.submit(v,c,body(TRACK_A,"guest-uncertain-retry"),idem);
        commands.processVenue(v);
        check(fake.effects==effects,"Replaying an uncertain command must not create a second remote effect");
        check(((Number)db.one("SELECT count(*) AS n FROM request_command WHERE venue_id=?",v).get("n")).intValue()==1,"HTTP retry must preserve a single durable command");
        UUID id=(UUID)db.one("SELECT id FROM request_command WHERE venue_id=?",v).get("id");
        db.exec("UPDATE request_command SET lease_until=now()-interval '3 minutes' WHERE id=?",id);
        // A fresh service models a restarted worker; recovery reads saved state.
        var restarted=new RequestCommands(db,new VenuePresence(db),fake,false);
        restarted.reconcile(v,id);
        check("SUCCEEDED".equals(db.one("SELECT status FROM request_command WHERE id=?",id).get("status")),"Read-only provider verification must finalize known success");
        check(fake.effects==effects,"Reconciliation must not call mutation again");
        restarted.reconcile(v,id);
        check(((Number)db.one("SELECT count(*) AS n FROM song_request_event WHERE command_id=?",id).get("n")).intValue()==1,"Recovered command must create exactly one local event");
        System.out.println("PASS outbox: unknown result preserved, retry/restart read-only verification avoids duplicate effect and event");
    }

    static void crashedWorkerRecovery() {
        UUID v=venue(),c=customer();var fake=new FakeSpotify();fake.crashAfterEffect=true;
        var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
        try {
            commands.submit(v,c,body(TRACK_A,"guest-crash-simulation"),key());
            throw new AssertionError("Worker crash simulation did not execute");
        } catch(AssertionError expected) {
            check(expected.getMessage().contains("simulated worker death"),"Unexpected failure during crash simulation");
        }
        var row=db.one("SELECT id,status,plan_json FROM request_command WHERE venue_id=?",v);
        check("APPLYING".equals(row.get("status")) && row.get("plan_json")!=null,"Crash must leave durable in-flight plan");
        db.exec("UPDATE request_command SET lease_until=now()-interval '1 second' WHERE id=?",row.get("id"));
        var restarted=new RequestCommands(db,new VenuePresence(db),fake,true);
        restarted.recoverPending();
        check("UNCERTAIN".equals(db.one("SELECT status FROM request_command WHERE id=?",row.get("id")).get("status")),"Expired applying lease must become uncertain");
        check(fake.applyCalls.get()==1 && fake.effects==1,"Restart must not replay unknown remote effect");
        System.out.println("PASS recovery: crashed worker retains plan; expired lease becomesUNCERTAIN without remote replay");
    }

    static void authAtomicBudgets() throws Exception {
        var limiter=new AuthRateLimiter(db);
        String peer=marker+"-peer", email=marker+"@example.test";
        Map<String,Object> body=Map.of("email",email);
        try {
            for(int i=0;i<10;i++)check(limiter.check("/api/auth/login",peer,body,"")==null,"Initial auth budget unexpectedly exhausted");
            long before=((Number)db.one("SELECT attempts FROM auth_rate_bucket WHERE scope='auth-global' AND key_hash=?",InfrastructureKt.hashToken("all")).get("attempts")).longValue();
            check(limiter.check("/api/auth/login",peer,body,"")!=null,"Principal budget must reject 11th attempt");
            long after=((Number)db.one("SELECT attempts FROM auth_rate_bucket WHERE scope='auth-global' AND key_hash=?",InfrastructureKt.hashToken("all")).get("attempts")).longValue();
            check(before==after,"Already-blocked client must not drain global budget");
            check(limiter.check("/api/auth/login",peer+"-independent",body,"")==null,"Attacker cannot globally lock victim mailbox");
            var rule=new AuthRateRule("p1-probe",marker,10,900);
            var workers=Executors.newFixedThreadPool(8);var successes=new AtomicInteger();var futures=new ArrayList<Future<?>>();
            try {
                for(int i=0;i<24;i++)futures.add(workers.submit(()->{if(limiter.consume(rule))successes.incrementAndGet();}));
                for(var f:futures)f.get(10,TimeUnit.SECONDS);
            } finally {workers.shutdownNow();}
            check(successes.get()==10,"Concurrent auth attempts exceeded shared atomic cap");
            System.out.println("PASS auth budgets: atomic concurrency, no mailbox-global lockout, rejected attempts preserve global budget");
        } finally {
            db.exec("DELETE FROM auth_rate_bucket WHERE scope='p1-probe' AND key_hash=?",InfrastructureKt.hashToken(marker));
            // All other keys in this isolated test database are bounded/expire;
            // do not purge global live buckets from a shared API instance.
        }
    }

    static class OwnedFakeSpotify extends FakeSpotify implements OwnedRequestSpotifyGateway {
        boolean expireOwnership;
        boolean expireAfterFirstEffect;
        boolean secondMutationReached;
        @Override public RequestPlaylistResult applyOwned(UUID venue,String token,String plan,
                kotlin.jvm.functions.Function0<kotlin.Unit> beforeMutation) {
            if(expireOwnership)db.exec("UPDATE request_command SET lease_until=now()-interval '1 second' WHERE venue_id=? AND status='APPLYING'",venue);
            beforeMutation.invoke();
            if(expireAfterFirstEffect) {
                super.apply(venue,token,plan);
                db.exec("UPDATE request_command SET lease_until=now()-interval '1 second' WHERE venue_id=? AND status='APPLYING'",venue);
                beforeMutation.invoke();
                secondMutationReached=true;
            }
            return super.apply(venue,token,plan);
        }
    }

    static void lostOwnershipFencesMutation() {
        UUID v=venue(),c=customer();var fake=new OwnedFakeSpotify();fake.expireOwnership=true;
        var commands=new RequestCommands(db,new VenuePresence(db),fake,false);
        commands.submit(v,c,body(TRACK_A,"guest-expired-owner"),key());
        check(fake.effects==0,"Expired command owner must not issue provider mutations");
        check("UNCERTAIN".equals(db.one("SELECT status FROM request_command WHERE venue_id=?",v).get("status")),"Expired applying ownership must retain uncertain result");
        UUID secondVenue=venue(), secondCustomer=customer();var partial=new OwnedFakeSpotify();partial.expireAfterFirstEffect=true;
        new RequestCommands(db,new VenuePresence(db),partial,false)
            .submit(secondVenue,secondCustomer,body(TRACK_A,"guest-partial-owner-loss"),key());
        check(partial.effects==1,"Fixture should preserve the already issued effect");
        check(!partial.secondMutationReached,"Lost ownership must fence the next step in a multi-mutation command");
        check("UNCERTAIN".equals(db.one("SELECT status FROM request_command WHERE venue_id=?",secondVenue).get("status")),"Partially applied owner loss must stay uncertain");
        System.out.println("PASS fencing: expired worker lease is checked before provider mutation");
    }

    public static void main(String[] args) throws Exception {
        String jdbc=System.getenv("TOCA_TEST_JDBC_URL");
        String user=System.getenv("TOCA_TEST_DB_USER"), password=System.getenv("TOCA_TEST_DB_PASSWORD");
        if(!"true".equals(System.getenv("TOCA_TEST_ALLOW_SCHEMA_MIGRATION")) || jdbc==null ||
            !jdbc.matches("jdbc:postgresql://(?:localhost|127\\.\\d+\\.\\d+\\.\\d+|\\[::1\\])(?::[0-9]+)?/[^?]*test[^?]*(?:\\?.*)?") || user==null || password==null)
            throw new IllegalArgumentException("Explicit local dedicated test database and TOCA_TEST_ALLOW_SCHEMA_MIGRATION=true are required");
        datasource=new HikariDataSource();datasource.setJdbcUrl(jdbc);
        datasource.setUsername(user);datasource.setPassword(password);
        datasource.setMaximumPoolSize(8);datasource.setConnectionTimeout(1500);
        Flyway.configure().dataSource(datasource).locations("classpath:db/migration").load().migrate();
        db=new Db(datasource);
        try {
            transactionReuse();presenceEvidence();authAtomicBudgets();requestIdentityAndReplay();authenticatedWindowCap();policyRevalidation();uncertainRemoteEffect();crashedWorkerRecovery();lostOwnershipFencesMutation();
            System.out.println("PASS P1 regression assertions="+assertions);
        } finally {
            for(UUID owner:owners){db.exec("DELETE FROM venue WHERE owner_id=?",owner);db.exec("DELETE FROM admin_user WHERE id=?",owner);}
            for(UUID customer:customers)db.exec("DELETE FROM customer_account WHERE id=?",customer);
            datasource.close();
        }
    }
}
