# Push Notifications — "Log your hours" reminder

## How it works
- Users subscribe via the bell icon (`components/PushSubscribe.tsx`), which registers
  `public/sw.js` and stores the subscription in the `push_subscriptions` table.
- `GET /api/push/send` sends a web-push to every stored subscription. It is protected
  by a `CRON_SECRET` Bearer token (`Authorization: Bearer <CRON_SECRET>`).

## What triggers it (IMPORTANT)
The daily reminder is **NOT** triggered by Vercel cron. Vercel's Hobby (free) plan does
not reliably run scheduled crons, so the cron block was removed from `vercel.json`.

The reminder is triggered by an **external scheduler at cron-job.org**:
- URL: `https://your-vercel-url.vercel.app/api/push/send`
- Schedule: **17:30, Mon–Fri** (set your local timezone in cron-job.org to avoid daylight-saving drift)
- Header: `Authorization: Bearer <CRON_SECRET>` (must match the `CRON_SECRET` env var in Vercel → Production)

## If notifications stop
1. Run the job manually from cron-job.org ("Run now"). A `200 {"sent":N}` = working.
2. `401 Unauthorized` → the `CRON_SECRET` in the cron-job.org header no longer matches
   Vercel. If you change `CRON_SECRET` in Vercel, you must **redeploy** for it to take
   effect, and update the header to match.
3. `200 {"sent":0}` → no active subscriptions; re-subscribe via the bell icon.
4. Check the cron-job.org execution history to confirm it's firing on schedule.
