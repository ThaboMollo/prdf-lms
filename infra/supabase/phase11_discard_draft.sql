-- Phase 11 — Let a client discard (delete) their own DRAFT application from the
-- apply wizard. Scoped to drafts so submitted applications can never be deleted
-- by the client. Idempotent; safe to re-run.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'loan_applications'
      and policyname = 'applications delete own draft'
  ) then
    create policy "applications delete own draft"
    on public.loan_applications
    for delete
    to authenticated
    using (
      status = 'Draft'
      and exists (
        select 1 from public.clients c
        where c.id = loan_applications.client_id
          and c.user_id = auth.uid()
      )
    );
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
