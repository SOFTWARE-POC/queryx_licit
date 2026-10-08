ALTER TABLE "schedules" ADD COLUMN "pattern_type" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "work_days" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "break_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "cycle_work_hours" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "cycle_rest_hours" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_pattern_type_ck" CHECK ("schedules"."pattern_type" is null or "schedules"."pattern_type" in ('WEEKLY', 'CYCLE'));--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_work_days_ck" CHECK ("schedules"."work_days" <@ array['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::text[]);--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_break_minutes_ck" CHECK ("schedules"."break_minutes" between 0 and 480);--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_pattern_ck" CHECK ("schedules"."pattern_type" is null
        or ("schedules"."pattern_type" = 'WEEKLY' and cardinality("schedules"."work_days") > 0
            and "schedules"."start_time" is not null and "schedules"."end_time" is not null)
        or ("schedules"."pattern_type" = 'CYCLE' and "schedules"."cycle_work_hours" > 0
            and "schedules"."cycle_rest_hours" > 0 and "schedules"."start_time" is not null));--> statement-breakpoint
-- Escalas que já existiam ficam com o padrão semanal dos dias que os colaboradores
-- já têm (união dos dias, intervalo mais comum). Só onde não há padrão, há turnos e
-- há horário de início e fim (exigido pelo padrão semanal): rodar de novo não muda nada.
UPDATE "schedules" AS s
SET "pattern_type" = 'WEEKLY',
    "work_days" = ARRAY(
      SELECT t.x
      FROM unnest(array['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::text[]) WITH ORDINALITY AS t(x, n)
      WHERE t.x = ANY (d."days")
      ORDER BY t.n
    ),
    "break_minutes" = least(greatest(d."break_minutes", 0), 480)
FROM (
  SELECT ws."schedule_id",
         array_agg(DISTINCT ws."day") AS "days",
         mode() WITHIN GROUP (ORDER BY ws."break_minutes") AS "break_minutes"
  FROM "schedule_worker_shifts" ws
  GROUP BY ws."schedule_id"
) AS d
WHERE s."id" = d."schedule_id"
  AND s."pattern_type" IS NULL
  AND s."start_time" IS NOT NULL
  AND s."end_time" IS NOT NULL;
