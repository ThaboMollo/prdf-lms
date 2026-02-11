# Support

## Common Issues

### API fails to start with DB connection error

- Ensure `SUPABASE_DB_CONNECTION_STRING` uses Npgsql format:
  - `Host=...;Port=...;Database=...;Username=...;Password=...;SSL Mode=Require;Trust Server Certificate=true`

### Frontend can login but `/me` fails

- Check `VITE_API_BASE_URL` points to running API URL.
- Validate API JWT settings:
  - `SUPABASE_URL`
  - `SUPABASE_JWT_AUDIENCE=authenticated`

### Build lock errors on Windows (`file is used by another process`)

- Stop running API process:
  - `Get-Process PRDF.Lms.Api | Stop-Process -Force`
- Re-run build.

### Notification reminders not appearing

- Confirm Quartz is running in API logs.
- Verify due rows exist:
  - open tasks with near due date
  - overdue installments
  - stale submitted/review apps.

## Operational Checks

- Health endpoint: `/health`
- Audit endpoint: `/api/reports/audit`
- Notification inbox: `/api/notifications`

## Escalation Path

1. Capture API logs around request time.
2. Capture request ID and failing endpoint.
3. Confirm RLS policy behavior in Supabase SQL editor.
4. Roll back to previous release if production impact is high.
