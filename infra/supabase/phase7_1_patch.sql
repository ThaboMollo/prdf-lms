do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='loan_documents' and policyname='documents write by staff') then
    drop policy "documents write by staff" on public.loan_documents;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='loan_documents' and policyname='documents insert by client') then
    create policy "documents insert by client"
    on public.loan_documents
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.loan_applications la
        join public.clients c on c.id = la.client_id
        where la.id = loan_documents.application_id
          and c.user_id = auth.uid()
      )
      or public.is_in_role(auth.uid(), 'Admin')
      or public.is_in_role(auth.uid(), 'LoanOfficer')
      or (
        (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
        and exists (
          select 1 from public.loan_applications la
          where la.id = loan_documents.application_id
            and la.assigned_to_user_id = auth.uid()
        )
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='loan_documents' and policyname='documents update by staff') then
    create policy "documents update by staff"
    on public.loan_documents
    for update
    to authenticated
    using (
      public.is_in_role(auth.uid(), 'Admin')
      or public.is_in_role(auth.uid(), 'LoanOfficer')
      or (
        (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
        and exists (
          select 1 from public.loan_applications la
          where la.id = loan_documents.application_id
            and la.assigned_to_user_id = auth.uid()
        )
      )
    )
    with check (
      public.is_in_role(auth.uid(), 'Admin')
      or public.is_in_role(auth.uid(), 'LoanOfficer')
      or (
        (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
        and exists (
          select 1 from public.loan_applications la
          where la.id = loan_documents.application_id
            and la.assigned_to_user_id = auth.uid()
        )
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan documents upload by owner') then
    create policy "loan documents upload by owner"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'loan-documents'
      and (
        public.is_in_role(auth.uid(), 'Admin')
        or public.is_in_role(auth.uid(), 'LoanOfficer')
        or exists (
          select 1
          from public.loan_applications la
          join public.clients c on c.id = la.client_id
          where la.id::text = split_part(name, '/', 2)
            and c.user_id = auth.uid()
        )
        or (
          (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
          and exists (
            select 1 from public.loan_applications la
            where la.id::text = split_part(name, '/', 2)
              and la.assigned_to_user_id = auth.uid()
          )
        )
      )
    );
  end if;
end $$;
