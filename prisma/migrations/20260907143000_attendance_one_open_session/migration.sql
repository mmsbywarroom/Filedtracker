-- Remove accidental same-second duplicate punch-in rows (race / double POST). Keep earliest id.
DELETE FROM "Attendance" a
USING "Attendance" b
WHERE a."userId" = b."userId"
  AND date_trunc('second', a."punchInAt") = date_trunc('second', b."punchInAt")
  AND a.id > b.id;

-- Before unique open-session index: close extra open sessions (keep earliest punch-in).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "punchInAt" ASC, id ASC) AS rn
  FROM "Attendance"
  WHERE "punchOutAt" IS NULL
)
UPDATE "Attendance" a
SET
  "punchOutAt" = COALESCE(a."lastKnownAt", a."punchInAt"),
  "punchOutLat" = COALESCE(a."lastKnownLat", a."punchInLat"),
  "punchOutLng" = COALESCE(a."lastKnownLng", a."punchInLng"),
  "punchOutReason" = 'duplicate_open_session_cleanup',
  "punchOutAddress" = COALESCE(a."punchOutAddress", 'Auto-closed duplicate open session')
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1
  AND a."punchOutAt" IS NULL;

-- At most one open attendance session per user (blocks concurrent punch-in races).
CREATE UNIQUE INDEX "Attendance_one_open_per_user"
ON "Attendance" ("userId")
WHERE "punchOutAt" IS NULL;
