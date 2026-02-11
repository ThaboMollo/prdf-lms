insert into public.roles (name)
values ('Admin'), ('LoanOfficer'), ('Intern'), ('Originator'), ('Client')
on conflict (name) do nothing;

insert into public.notification_templates (type, channel, title_template, body_template, is_active)
values
  ('ApplicationStatusChanged', 'InApp', 'Application status updated', 'Your application status changed to {{status}}.', true),
  ('TaskReminder', 'InApp', 'Task reminder', 'You have an open task due soon.', true),
  ('ArrearsReminder', 'InApp', 'Repayment overdue', 'Your repayment is overdue. Please make payment as soon as possible.', true),
  ('StaleApplicationFollowUp', 'InApp', 'Application follow-up', 'This application requires follow-up.', true)
on conflict (type) do nothing;
