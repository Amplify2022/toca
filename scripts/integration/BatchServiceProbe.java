import com.amplify.api.*;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.exceptions.HttpStatusException;
import java.util.*;
import java.util.concurrent.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
public class BatchServiceProbe {
 static int checks=0;
 static void check(boolean value){if(!value)throw new AssertionError("Check "+checks);checks++;}
 static void denied(Runnable action,HttpStatus status){try{action.run();throw new AssertionError("Expected "+status);}catch(HttpStatusException e){check(e.getStatus()==status);}}
 public static void main(String[] args)throws Exception{
  String url=System.getenv("TOCA_TEST_JDBC_URL");if(url==null||!url.matches("jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/[^/?]*test[^/?]*")||!"true".equals(System.getenv("TOCA_TEST_ALLOW_SCHEMA_MIGRATION")))throw new IllegalArgumentException("Dedicated local test DB required");
  var ds=new HikariDataSource();ds.setJdbcUrl(url);ds.setUsername(System.getenv("TOCA_TEST_DB_USER"));ds.setPassword(System.getenv("TOCA_TEST_DB_PASSWORD"));ds.setMaximumPoolSize(8);
  Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate();var db=new Db(ds);var roles=new RolePolicy(db);var admin=new Auth(db,roles);var customers=new CustomerAuth(db,roles);var media=new VenueMediaService(db);
  var accounts=new AccountManagement(db,customers,admin,new AccountMail("",587,"","","","https://example.test"));
  String tag=UUID.randomUUID().toString();UUID owner=UUID.randomUUID(),venue=UUID.randomUUID();String email="test-"+tag+"@example.test";
  try{
   denied(()->admin.register(Map.of("name","Test","email",email,"password","A".repeat(73))),HttpStatus.BAD_REQUEST);
   denied(()->admin.login(Map.of("email",email,"password","A".repeat(73))),HttpStatus.BAD_REQUEST);
   db.exec("INSERT INTO admin_user(id,name,email,password_hash) VALUES(?,?,?,?)",owner,"Test",tag+"@owner.test","fixture");
   db.exec("INSERT INTO venue(id,owner_id,name,slug,address,city,latitude,longitude,join_token) VALUES(?,?,?,?,?,?,?,?,?)",venue,owner,"Test",tag,"Center","Montevideo",-34.9,-56.2,tag);
   var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(20,20,BufferedImage.TYPE_INT_RGB),"jpeg",out);
   Map<String,Object> body=Map.of("contentType","image/jpeg","dataBase64",Base64.getEncoder().encodeToString(out.toByteArray()));
   for(int i=0;i<7;i++)media.add(venue,body);
   var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);var jobs=new ArrayList<Future<Boolean>>();
   for(int i=0;i<2;i++)jobs.add(executor.submit(()->{start.await();try{media.add(venue,body);return true;}catch(HttpStatusException e){if(e.getStatus()!=HttpStatus.CONFLICT)throw e;return false;}}));
   start.countDown();int added=0;for(var job:jobs)if(job.get())added++;executor.shutdownNow();check(added==1);check(((Number)db.one("SELECT count(*) AS n FROM venue_photo WHERE venue_id=?",venue).get("n")).intValue()==8);
   var photos=db.list("SELECT id FROM venue_photo WHERE venue_id=?",venue);
   var deletes=Executors.newFixedThreadPool(8);var deletionStart=new CountDownLatch(1);var deletionJobs=new ArrayList<Future<Boolean>>();
   for(var photo:photos)deletionJobs.add(deletes.submit(()->{deletionStart.await();try{media.delete(venue,(UUID)photo.get("id"));return true;}catch(HttpStatusException e){if(e.getStatus()!=HttpStatus.CONFLICT)throw e;return false;}}));
   deletionStart.countDown();int removed=0;for(var job:deletionJobs)if(job.get())removed++;deletes.shutdownNow();check(removed==7);check(((Number)db.one("SELECT count(*) AS n FROM venue_photo WHERE venue_id=?",venue).get("n")).intValue()==1);
   var session=customers.register(Map.of("name","Customer","email",email,"password","Original-password-123"));String auth="Bearer "+session.get("token");UUID id=(UUID)customers.user(auth).get("id");
   var fav=new FavoriteController(customers,db);fav.add(venue.toString(),auth);check(fav.list(auth).equals(List.of(venue.toString())));fav.remove(venue.toString(),auth);check(fav.list(auth).isEmpty());
   denied(()->accounts.request("customer",email,"reset"),HttpStatus.SERVICE_UNAVAILABLE);
   accounts.change("customer",auth,Map.of("currentPassword","Original-password-123","newPassword","Changed-password-123"));denied(()->customers.user(auth),HttpStatus.UNAUTHORIZED);
   var changed=customers.login(Map.of("email",email,"password","Changed-password-123"));String auth2="Bearer "+changed.get("token");check(customers.user(auth2).get("id").equals(id));
   String reset="reset-"+tag;db.exec("INSERT INTO account_action(token_hash,kind,account_id,purpose,expires_at) VALUES(?, 'customer',?,'reset',now()+interval '30 minutes')",InfrastructureKt.hashToken(reset),id);
   accounts.consume("customer",Map.of("token",reset,"password","Reset-password-123"));denied(()->accounts.consume("customer",Map.of("token",reset,"password","Reset-password-123")),HttpStatus.BAD_REQUEST);denied(()->customers.user(auth2),HttpStatus.UNAUTHORIZED);
   var resetSession=customers.login(Map.of("email",email,"password","Reset-password-123"));String auth3="Bearer "+resetSession.get("token");
   String verify="verify-"+tag;db.exec("INSERT INTO account_action(token_hash,kind,account_id,purpose,expires_at) VALUES(?,'customer',?,'verify',now()+interval '30 minutes')",InfrastructureKt.hashToken(verify),id);accounts.consume("customer",Map.of("token",verify));check(db.one("SELECT email_verified_at FROM customer_account WHERE id=?",id).get("email_verified_at")!=null);
   accounts.delete("customer",auth3,Map.of("password","Reset-password-123","confirmation","ELIMINAR"));check(db.one("SELECT id FROM customer_account WHERE id=?",id)==null);
   System.out.println("PASS batch integration: "+checks+" checks (password byte limit, concurrent photos, favorites, recovery/verification tokens, session revocation, deletion)");
  }finally{db.exec("DELETE FROM account_action WHERE account_id IN (SELECT id FROM customer_account WHERE email=?)",email);db.exec("DELETE FROM customer_account WHERE email=?",email);db.exec("DELETE FROM venue WHERE id=?",venue);db.exec("DELETE FROM admin_user WHERE id=?",owner);ds.close();}
 }
}
