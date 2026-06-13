-- Migration 001 — convert all timestamp columns to TIMESTAMPTZ.
--
-- Bug: columns were `timestamp without time zone` storing UTC wall-clock, but the
-- node-postgres driver interprets such values in the Node process's local tz
-- (IST here), shifting every instant by -5:30. Converting to timestamptz makes
-- the driver return the correct absolute instant regardless of process tz.
--
-- Existing naive values were written by NOW() under a UTC session, so they are
-- UTC — the USING clause says exactly that.

ALTER TABLE stocks          ALTER COLUMN created_at     TYPE TIMESTAMPTZ USING created_at     AT TIME ZONE 'UTC';
ALTER TABLE watchlist       ALTER COLUMN added_at       TYPE TIMESTAMPTZ USING added_at       AT TIME ZONE 'UTC';
ALTER TABLE signals         ALTER COLUMN generated_at   TYPE TIMESTAMPTZ USING generated_at   AT TIME ZONE 'UTC';
ALTER TABLE signal_outcomes ALTER COLUMN evaluated_at   TYPE TIMESTAMPTZ USING evaluated_at   AT TIME ZONE 'UTC';
ALTER TABLE signal_outcomes ALTER COLUMN last_checked_at TYPE TIMESTAMPTZ USING last_checked_at AT TIME ZONE 'UTC';
ALTER TABLE paper_trades    ALTER COLUMN entry_time     TYPE TIMESTAMPTZ USING entry_time     AT TIME ZONE 'UTC';
ALTER TABLE paper_trades    ALTER COLUMN exit_time      TYPE TIMESTAMPTZ USING exit_time      AT TIME ZONE 'UTC';
ALTER TABLE kite_sessions   ALTER COLUMN expires_at     TYPE TIMESTAMPTZ USING expires_at     AT TIME ZONE 'UTC';
ALTER TABLE kite_sessions   ALTER COLUMN created_at     TYPE TIMESTAMPTZ USING created_at     AT TIME ZONE 'UTC';
