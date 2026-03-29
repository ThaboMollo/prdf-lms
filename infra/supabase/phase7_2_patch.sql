do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='loan_applications' and policyname='applications update by client') then
    create policy "applications update by client"
    on public.loan_applications
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.clients c
        where c.id = loan_applications.client_id
          and c.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.clients c
        where c.id = loan_applications.client_id
          and c.user_id = auth.uid()
      )
    );
  end if;
end $$;
