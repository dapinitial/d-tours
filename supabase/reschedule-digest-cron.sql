-- Operational runbook (NOT an auto-applied migration — pg_cron jobs live in the DB,
-- not in version-controlled migrations). Run in the Supabase SQL editor for project
-- pucyvfwrosinnbgkremb AFTER the new /api/digest code is deployed.
--
-- WHY: the digest cron used to fire once daily at a fixed UTC time (~13:30 UTC → 8:30
-- Central). The new endpoint is an hourly dispatcher that sends only when a trip's local
-- hour == its digest_hour. So the job must tick HOURLY. This is safe only once the new
-- (hour-gated) code is live — otherwise the old code would send a digest every hour.

-- 1) SEE the current jobs first — find the digest one and note its jobid/schedule.
select jobid, jobname, schedule, active, command
from cron.job
order by jobid;

-- 2) RESCHEDULE the digest job to hourly at :07 (off the :00 stampede). Matches the job
--    by its command hitting /api/digest, so you don't need to hardcode the name.
do $$
declare j record;
begin
  for j in select jobid, jobname from cron.job where command ilike '%/api/digest%' loop
    perform cron.alter_job(job_id => j.jobid, schedule => '7 * * * *');
    raise notice 'rescheduled % (jobid %) to hourly', j.jobname, j.jobid;
  end loop;
end $$;

-- 3) VERIFY.
select jobid, jobname, schedule, active from cron.job where command ilike '%/api/digest%';

-- Rollback (back to the old daily 13:30 UTC fire):
--   do $$ declare j record; begin
--     for j in select jobid from cron.job where command ilike '%/api/digest%' loop
--       perform cron.alter_job(job_id => j.jobid, schedule => '30 13 * * *');
--     end loop; end $$;
