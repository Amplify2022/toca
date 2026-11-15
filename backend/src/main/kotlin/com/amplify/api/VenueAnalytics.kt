package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.sql.Timestamp
import java.time.*
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.UUID

@JsonInclude(JsonInclude.Include.ALWAYS)
data class AnalyticsDay(val date:String,val requests:Long)
@JsonInclude(JsonInclude.Include.ALWAYS)
data class AnalyticsSong(val trackId:String,val title:String,val artist:String,val requests:Long)
@JsonInclude(JsonInclude.Include.ALWAYS)
data class AnalyticsIncome(val status:String="NOT_CONFIGURED",val currency:String="UYU")
@JsonInclude(JsonInclude.Include.ALWAYS)
data class VenueAnalytics(
    val period:String,val timeZone:String,val from:String,val to:String,val updatedAt:String,
    val users:Long,val requests:Long,val returningUsers:Long,val previousUsers:Long,val previousRequests:Long,
    val days:List<AnalyticsDay>,val topSongs:List<AnalyticsSong>,val income:AnalyticsIncome=AnalyticsIncome()
)

data class AnalyticsRange(val from:LocalDate,val to:LocalDate,val start:Instant,val previousStart:Instant,val previousUntil:Instant) {
    companion object {
        val ZONE:ZoneId=ZoneId.of("America/Montevideo")
        fun at(period:String,now:Instant):AnalyticsRange {
            val local=now.atZone(ZONE)
            val today=local.toLocalDate()
            val first=when(period){
                "week"->today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                "month"->today.withDayOfMonth(1)
                else->fail(HttpStatus.BAD_REQUEST,"Período inválido. Elegí semana o mes")
            }
            val previous=if(period=="week")first.minusWeeks(1) else first.minusMonths(1)
            val start=first.atStartOfDay(ZONE).toInstant()
            val comparable=previous.atStartOfDay(ZONE).plusDays(ChronoUnit.DAYS.between(first,today)).with(local.toLocalTime()).toInstant()
            return AnalyticsRange(first,today,start,previous.atStartOfDay(ZONE).toInstant(),minOf(start,comparable))
        }
    }
}

@Singleton
class VenueAnalyticsService(private val db:Db) {
    /** A confirmed command is one order, even when it promotes an existing song.
     * One SQL snapshot keeps totals, distinct users and the chart consistent.
     * Wallet topups are global and simulated; they are never venue revenue. */
    fun snapshot(venue:UUID,period:String,at:Instant=Instant.now()):VenueAnalytics {
        val range=AnalyticsRange.at(period,at)
        val rows=db.list("""WITH first_requests AS (
            SELECT customer_id,min(updated_at) AS first_at FROM request_command
            WHERE venue_id=? AND status='SUCCEEDED' GROUP BY customer_id
        ) SELECT c.customer_id,c.track_id,max(c.title) AS title,max(c.artist) AS artist,
            (c.updated_at AT TIME ZONE 'America/Montevideo')::date AS day,
            count(*) AS requests,f.first_at
            FROM request_command c JOIN first_requests f ON f.customer_id=c.customer_id
            WHERE c.venue_id=? AND c.status='SUCCEEDED' AND c.updated_at>=? AND c.updated_at<?
              AND (c.updated_at>=? OR c.updated_at<?)
            GROUP BY c.customer_id,c.track_id,day,f.first_at""",venue,venue,
            Timestamp.from(range.previousStart),Timestamp.from(at),Timestamp.from(range.start),Timestamp.from(range.previousUntil))
        fun day(row:Map<String,Any?>)=(row.getValue("day") as java.sql.Date).toLocalDate()
        fun count(row:Map<String,Any?>)=(row.getValue("requests") as Number).toLong()
        val current=rows.filter{!day(it).isBefore(range.from)}
        val previous=rows.filter{day(it).isBefore(range.from)}
        val users=current.map{it["customer_id"]}.distinct()
        val returning=current.filter{(it.getValue("first_at") as Timestamp).toInstant().isBefore(range.start)}.map{it["customer_id"]}.distinct()
        val daily=current.groupBy(::day).mapValues{(_,facts)->facts.sumOf(::count)}
        val days=generateSequence(range.from){it.plusDays(1)}.takeWhile{!it.isAfter(range.to)}
            .map{AnalyticsDay(it.toString(),daily[it]?:0L)}.toList()
        val songs=current.groupBy{it.getValue("track_id").toString()}.map{(id,facts)->
            AnalyticsSong(id,facts.firstNotNullOfOrNull{(it["title"] as? String)?.takeIf(String::isNotBlank)}?:"Canción sin título",
                facts.firstNotNullOfOrNull{(it["artist"] as? String)?.takeIf(String::isNotBlank)}?:"",facts.sumOf(::count))
        }.sortedWith(compareByDescending<AnalyticsSong>{it.requests}.thenBy{it.title}.thenBy{it.trackId}).take(5)
        return VenueAnalytics(period,AnalyticsRange.ZONE.id,range.from.toString(),range.to.toString(),at.toString(),
            users.size.toLong(),current.sumOf(::count),returning.size.toLong(),
            previous.map{it["customer_id"]}.distinct().size.toLong(),previous.sumOf(::count),days,songs)
    }
}

@Controller("/api/admin/venues/{id}/analytics")
@ExecuteOn(TaskExecutors.BLOCKING)
class VenueAnalyticsController(private val auth:Auth,private val analytics:VenueAnalyticsService) {
    @Get fun snapshot(id:String,@Header(value="Authorization",defaultValue="") authorization:String,
        @QueryValue(defaultValue="week") period:String):HttpResponse<VenueAnalytics> {
        auth.ownVenue(id,authorization)
        return HttpResponse.ok(analytics.snapshot(safeUuid(id),period)).header("Cache-Control","no-store, private").header("Vary","Authorization")
    }
}
