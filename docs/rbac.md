# RBAC

Roles:
- `Admin`
- `LoanOfficer`
- `Intern`
- `Originator`
- `Client`

## Permission Summary

- `Admin`: full system access, audit/reporting, compliance setup.
- `LoanOfficer`: application decisions, disbursements, repayments, reporting.
- `Intern`/`Originator`: assisted onboarding, assigned application updates, tasks/notes.
- `Client`: own applications, uploads, timelines, assigned tasks, notifications.

## Enforcement Layers

1. API role checks (controller/service).
2. DB RLS policies for row-level guarantees.
3. Audit log inserts on critical mutations.

## Key Role-Sensitive Flows

- Status transitions beyond submit: LoanOfficer/Admin only.
- Assisted onboarding: internal roles only.
- Task CRUD:
  - create/update by internal roles
  - completion by assignee or staff
- Document verification: LoanOfficer/Admin only.
- Audit report endpoints: LoanOfficer/Admin only.
