# API Spec

## Auth/Health

- `GET /health`
- `GET /me`

## Applications

- `POST /api/applications`
- `PUT /api/applications/{id}`
- `POST /api/applications/{id}/submit`
- `GET /api/applications`
- `GET /api/applications/{id}`
- `POST /api/applications/{id}/status`
- `GET /api/applications/{id}/history`
- `GET /api/applications/{id}/notes`
- `POST /api/applications/{id}/notes`

## Documents

- `POST /api/applications/{id}/documents/presign-upload`
- `POST /api/applications/{id}/documents/confirm`
- `GET /api/applications/{id}/documents`
- `POST /api/applications/{applicationId}/documents/{documentId}/verify`

## Client Onboarding

- `POST /api/clients/assisted`
- `POST /api/clients/{id}/invite`

## Tasks

- `GET /api/tasks?applicationId={id}&assignedToMe=true|false`
- `POST /api/tasks`
- `PUT /api/tasks/{id}`
- `POST /api/tasks/{id}/complete`

## Loans/Portfolio

- `GET /api/loans/{id}`
- `POST /api/loans/{id}/disburse`
- `POST /api/loans/{id}/repayments`
- `GET /api/reports/portfolio`
- `GET /api/reports/arrears`

## Notifications

- `GET /api/notifications?unreadOnly=true|false`
- `POST /api/notifications/{id}/read`

## Compliance/Reporting

- `GET /api/document-requirements`
- `POST /api/document-requirements`
- `GET /api/reports/audit?from=&to=&limit=`
- `GET /api/reports/turnaround`
- `GET /api/reports/pipeline-conversion`
- `GET /api/reports/productivity`

## Example: Mark Notification Read

```http
POST /api/notifications/{id}/read
Authorization: Bearer <supabase-jwt>
```

Response:

```http
204 No Content
```
