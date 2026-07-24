-- Role catalogue and reference data, applied after the baseline migration on
-- every fresh tenant. No client-specific data belongs here — that's
-- packages/tenant-config (branding) and per-tenant loan_products /
-- document_requirements rows (Phase 5 provisioning), not this file.

insert into public.roles (name)
values ('SuperAdmin'), ('Admin'), ('LoanOfficer'), ('Intern'), ('Originator'), ('Client')
on conflict (name) do nothing;

insert into public.notification_templates (type, channel, title_template, body_template, is_active)
values
  ('ApplicationStatusChanged', 'InApp', 'Application status updated', 'Your application status changed to {{status}}.', true),
  ('TaskReminder', 'InApp', 'Task reminder', 'You have an open task due soon.', true),
  ('ArrearsReminder', 'InApp', 'Repayment overdue', 'Your repayment is overdue. Please make payment as soon as possible.', true),
  ('StaleApplicationFollowUp', 'InApp', 'Application follow-up', 'This application requires follow-up.', true)
on conflict (type) do nothing;
