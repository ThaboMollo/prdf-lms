-- =============================================================================
-- RLS performance: wrap is_in_role() calls in a scalar subquery.
--
-- Implements platform-architecture-design.md §6.6: "Rewrite the 51 policies'
-- is_in_role(...) calls in the (select is_in_role(...)) form so the planner
-- caches the result per statement instead of re-evaluating per row."
--
-- Why this matters: is_in_role() joins user_roles to roles. Called bare in a
-- policy predicate, PostgreSQL treats it as a per-row expression and executes
-- that join once for every candidate row. Wrapped in a scalar subquery it
-- becomes an InitPlan — evaluated once per statement and reused. On a table
-- scan behind a policy this is the difference between N joins and one.
--
-- Semantics are unchanged: is_in_role is STABLE and depends only on auth.uid()
-- and the role tables, neither of which varies per row, so hoisting it out of
-- the row loop cannot change which rows match. The RLS assertion suite
-- (infra/supabase/tests/) was run before and after this migration and returns
-- identical results — that equivalence is the reason the suite was built first.
--
-- ALTER POLICY is used rather than DROP/CREATE so the policies are never
-- momentarily absent, and so this migration cannot accidentally change a
-- policy's command, roles, or permissive/restrictive nature — only its
-- expression.
--
-- Generated from the deparsed policy definitions rather than hand-edited: at
-- 39 policies and 130 call sites, hand-editing would have been the riskier
-- path. Every call had the identical shape is_in_role(auth.uid(), '<Role>'::text).
--
-- NOTE: auth.uid() itself is also re-evaluated per row and could be wrapped the
-- same way. It is deliberately left alone here — it reads a GUC rather than
-- touching tables, so the win is far smaller, and keeping this migration to
-- exactly what §6.6 asked for keeps it reviewable.
-- =============================================================================

alter policy "consents insert" on public.application_consents
  with check (((EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = application_consents.application_id) AND (c.user_id = auth.uid())))) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = application_consents.application_id) AND (la.assigned_to_user_id = auth.uid()) AND ((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))))))));
alter policy "consents select" on public.application_consents
  using (((EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = application_consents.application_id) AND (c.user_id = auth.uid())))) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = application_consents.application_id) AND (la.assigned_to_user_id = auth.uid()) AND ((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))))))));
alter policy "status history readable by related" on public.application_status_history
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = application_status_history.application_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "status history write by staff" on public.application_status_history
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))));
alter policy "audit log admin read" on public.audit_log
  using ((select is_in_role(auth.uid(), 'Admin'::text)));
alter policy "clients own read write" on public.clients
  using (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))))
  with check (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))));
alter policy "disbursements insert by staff" on public.disbursements
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM (loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
  WHERE ((l.id = disbursements.loan_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "disbursements select by related role" on public.disbursements
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM ((loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((l.id = disbursements.loan_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "doc requirements staff read write" on public.document_requirements
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))));
alter policy "applications client access" on public.loan_applications
  using (((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = loan_applications.client_id) AND (c.user_id = auth.uid())))) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (assigned_to_user_id = auth.uid()))));
alter policy "applications client create" on public.loan_applications
  with check (((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = loan_applications.client_id) AND (c.user_id = auth.uid())))) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (assigned_to_user_id = auth.uid()))));
alter policy "applications update by role" on public.loan_applications
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (assigned_to_user_id = auth.uid()))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (assigned_to_user_id = auth.uid()))));
alter policy "documents insert by client" on public.loan_documents
  with check (((EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = loan_documents.application_id) AND (c.user_id = auth.uid())))) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loan_documents.application_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "documents read by related role" on public.loan_documents
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = loan_documents.application_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "documents update by staff" on public.loan_documents
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loan_documents.application_id) AND (la.assigned_to_user_id = auth.uid())))))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loan_documents.application_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "loans insert by staff" on public.loans
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loans.application_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "loans select by related role" on public.loans
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = loans.application_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "loans update by staff" on public.loans
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loans.application_id) AND (la.assigned_to_user_id = auth.uid())))))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE ((la.id = loans.application_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "NFS insertable by internals" on public.non_financial_support
  with check (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "NFS readable by internals and clients" on public.non_financial_support
  using (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (select is_in_role(auth.uid(), 'Admin'::text)) OR ((select is_in_role(auth.uid(), 'Client'::text)) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))))));
alter policy "NFS updatable by internals" on public.non_financial_support
  using (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "notes insert related" on public.notes
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = notes.application_id) AND (c.user_id = auth.uid()))))));
alter policy "notes read related" on public.notes
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((la.id = notes.application_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "notification templates staff read write" on public.notification_templates
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text))));
alter policy "notifications self read" on public.notifications
  using (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "notifications self update read status" on public.notifications
  using (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text))))
  with check (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "profiles self read" on public.profiles
  using (((auth.uid() = user_id) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "profiles self upsert" on public.profiles
  using (((auth.uid() = user_id) OR (select is_in_role(auth.uid(), 'Admin'::text))))
  with check (((auth.uid() = user_id) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "repayment schedule insert by staff" on public.repayment_schedule
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM (loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
  WHERE ((l.id = repayment_schedule.loan_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "repayment schedule select by related role" on public.repayment_schedule
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM ((loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((l.id = repayment_schedule.loan_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "repayment schedule update by staff" on public.repayment_schedule
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM (loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
  WHERE ((l.id = repayment_schedule.loan_id) AND (la.assigned_to_user_id = auth.uid())))))))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM (loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
  WHERE ((l.id = repayment_schedule.loan_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "repayments insert by staff" on public.repayments
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM (loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
  WHERE ((l.id = repayments.loan_id) AND (la.assigned_to_user_id = auth.uid())))))));
alter policy "repayments select by related role" on public.repayments
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM ((loans l
     JOIN loan_applications la ON ((la.id = l.application_id)))
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE ((l.id = repayments.loan_id) AND ((c.user_id = auth.uid()) OR (la.assigned_to_user_id = auth.uid())))))));
alter policy "tasks read related" on public.tasks
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (assigned_to = auth.uid())));
alter policy "tasks write by staff" on public.tasks
  using (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (assigned_to = auth.uid())))
  with check (((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (assigned_to = auth.uid())));
alter policy "user preferences self read write" on public.user_preferences
  using (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text))))
  with check (((user_id = auth.uid()) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "user roles self read" on public.user_roles
  using (((auth.uid() = user_id) OR (select is_in_role(auth.uid(), 'Admin'::text))));
alter policy "loan documents read by owner" on storage.objects
  using (((bucket_id = 'loan-documents'::text) AND ((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE (((la.id)::text = split_part(objects.name, '/'::text, 2)) AND (c.user_id = auth.uid())))) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE (((la.id)::text = split_part(objects.name, '/'::text, 2)) AND (la.assigned_to_user_id = auth.uid()))))))));
alter policy "loan documents upload by owner" on storage.objects
  with check (((bucket_id = 'loan-documents'::text) AND ((select is_in_role(auth.uid(), 'Admin'::text)) OR (select is_in_role(auth.uid(), 'LoanOfficer'::text)) OR (EXISTS ( SELECT 1
   FROM (loan_applications la
     JOIN clients c ON ((c.id = la.client_id)))
  WHERE (((la.id)::text = split_part(objects.name, '/'::text, 2)) AND (c.user_id = auth.uid())))) OR (((select is_in_role(auth.uid(), 'Intern'::text)) OR (select is_in_role(auth.uid(), 'Originator'::text))) AND (EXISTS ( SELECT 1
   FROM loan_applications la
  WHERE (((la.id)::text = split_part(objects.name, '/'::text, 2)) AND (la.assigned_to_user_id = auth.uid()))))))));

notify pgrst, 'reload schema';
