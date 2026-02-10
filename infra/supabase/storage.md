# Supabase Storage Setup

Create these private buckets:
- `loan-documents`
- `profile-attachments`

## Dev/Prod
Use separate Supabase projects for `dev` and `prod`.

## Recommended bucket policies
- Only authenticated users can upload.
- Download through signed URLs issued by API.
- Prefix files by tenant/app context, for example: `applications/{application_id}/...`.

## Required env
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
