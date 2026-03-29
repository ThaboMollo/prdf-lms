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

## Role and Action Matrix

Legend:
- `R`: Read/view
- `W`: Create/update/act
- `N/A`: no access

| Area | Action | Client | Intern | Originator | LoanOfficer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | Register/login | W | W | W | W | W |
| Client Profile | View own profile | R | N/A | N/A | N/A | N/A |
| Client Profile | Edit own profile | W | N/A | N/A | N/A | N/A |
| Client Profile | View client profile | N/A | R (assigned) | R (assigned) | R | R |
| Client Profile | Edit client profile | N/A | W (assigned) | W (assigned) | W | W |
| Applications | Create draft (self) | W | N/A | N/A | N/A | N/A |
| Applications | Create draft (assisted) | N/A | W | W | W | W |
| Applications | Submit | W (self) | W (assisted) | W (assisted) | W | W |
| Applications | View list | R (own) | R (assigned) | R (assigned) | R | R |
| Applications | Update draft | W (own) | W (assigned) | W (assigned) | W | W |
| Applications | Change status (post-submit) | N/A | N/A | N/A | W | W |
| Applications | Request more info | N/A | N/A | N/A | W | W |
| Notes/Tasks | Create note/task | N/A | W | W | W | W |
| Notes/Tasks | Update task | N/A | W (assigned) | W (assigned) | W | W |
| Notes/Tasks | Complete task | N/A | W (assigned) | W (assigned) | W | W |
| Documents | Upload | W (own) | W (assisted) | W (assisted) | W | W |
| Documents | View | R (own) | R (assigned) | R (assigned) | R | R |
| Documents | Verify | N/A | N/A | N/A | W | W |
| Decisions | Assess application | N/A | N/A | N/A | W | W |
| Decisions | Approve/Reject/Defer | N/A | N/A | N/A | W | W |
| Disbursement | Capture disbursement | N/A | N/A | N/A | W | W |
| Repayments | Record repayment | N/A | N/A | N/A | W | W |
| Repayments | View schedule/history | R (own) | N/A | N/A | R | R |
| Reports | View dashboards | N/A | N/A | N/A | R | R |
| Reports | Export | N/A | N/A | N/A | W | W |
| Admin | User/role management | N/A | N/A | N/A | N/A | W |
| Admin | Configure document requirements | N/A | N/A | N/A | N/A | W |
| Admin | Configure notification templates | N/A | N/A | N/A | N/A | W |
| Audit | View audit log | N/A | N/A | N/A | R | R |

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
