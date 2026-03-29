do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan documents read by owner') then
    create policy "loan documents read by owner"
    on storage.objects
    for select
    to authenticated
    using (
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
