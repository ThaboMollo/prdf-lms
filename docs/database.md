# Database

Schema source: `infra/supabase/schema.sql`  
Policies source: `infra/supabase/rls.sql`  
Seed source: `infra/supabase/seed.sql`

## Core Tables

- Identity/RBAC: `profiles`, `roles`, `user_roles`
- Lending flow: `clients`, `loan_applications`, `loan_documents`, `application_status_history`
- Operations: `tasks`, `notes`
- Portfolio: `loans`, `disbursements`, `repayments`, `repayment_schedule`
- Notifications: `notifications`, `notification_templates`, `user_preferences`
- Compliance/Audit: `document_requirements`, `audit_log`

## RLS Strategy

- RLS enabled for all business tables.
- `roles` stays readable without RLS (lookup table).
- Client users see only own client/application/doc/task/note rows.
- Intern/Originator constrained to assigned applications/tasks.
- LoanOfficer/Admin have broad access for review/decision/reporting.

## Immutable Controls

- `loan_documents` immutable fields enforced by trigger:
  - `application_id`, `doc_type`, `storage_path`, `uploaded_by`, `uploaded_at`

## Indexes (High-value)

- Status/timeline: `idx_status_history_application_id`
- Task board: `idx_tasks_application_id`
- Notes timeline: `idx_notes_application_id`, `idx_notes_created_at`
- Notification inbox: `idx_notifications_user_created`, `idx_notifications_unread`
- Portfolio/arrears: `idx_repayment_schedule_due_date`, `idx_repayments_paid_at`

## Migration Notes

- Keep all schema updates additive and scriptable.
- Run order:
1. `schema.sql`
2. `rls.sql`
3. `seed.sql`
4. incremental patches (e.g. `phase4_2_patch.sql`) when needed.
