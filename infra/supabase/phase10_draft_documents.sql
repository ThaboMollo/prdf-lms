-- Phase 10 — Let clients manage documents on their own DRAFT applications so the
-- apply wizard can upload-on-add and support remove/replace before submitting.
-- Existing policies already allow the owning client to INSERT and SELECT their
-- own documents (table + storage); this only adds DELETE, scoped to drafts.
-- Idempotent; safe to re-run.

-- loan_documents: owning client may delete rows while the application is a draft.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'loan_documents'
      and policyname = 'documents delete by client on draft'
  ) then
    create policy "documents delete by client on draft"
    on public.loan_documents
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.loan_applications la
        join public.clients c on c.id = la.client_id
        where la.id = loan_documents.application_id
          and c.user_id = auth.uid()
          and la.status = 'Draft'
      )
    );
  end if;
end $$;

-- storage.objects: owning client may delete their draft's uploaded files.
-- Path shape is applications/{application_id}/{uuid}-{filename}.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'loan documents delete by owner on draft'
  ) then
    create policy "loan documents delete by owner on draft"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'loan-documents'
      and exists (
        select 1
        from public.loan_applications la
        join public.clients c on c.id = la.client_id
        where la.id::text = split_part(name, '/', 2)
          and c.user_id = auth.uid()
          and la.status = 'Draft'
      )
    );
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
