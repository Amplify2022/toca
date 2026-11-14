-- Request ordering has its own playback cycle. Restarting a playlist must not
-- invalidate the customer's independently verified location/session.
ALTER TABLE venue ADD COLUMN request_cycle_started_at TIMESTAMPTZ;

-- Preserve the most recent confirmed automatic restart from the previous
-- version, so old requests do not jump ahead after this upgrade either.
UPDATE venue v SET request_cycle_started_at=r.started_at
FROM (
    SELECT venue_id,max(updated_at) AS started_at FROM request_command
    WHERE status='SUCCEEDED' AND playback_attempted
      AND plan_json ~ '"restartPlayback"[[:space:]]*:[[:space:]]*true'
    GROUP BY venue_id
) r WHERE v.id=r.venue_id;
