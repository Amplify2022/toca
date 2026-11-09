-- Durable fence between administrator edits and customer playlist requests.
CREATE TABLE venue_music_operation (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
    input_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PREPARING','APPLYING','UNCERTAIN','COMPLETED','FAILED','RELEASED')),
    plan TEXT,
    result TEXT,
    message VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX venue_music_operation_open ON venue_music_operation(venue_id)
    WHERE status IN ('PREPARING','APPLYING','UNCERTAIN');
