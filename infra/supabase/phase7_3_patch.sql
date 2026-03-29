do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='application_status_history' and policyname='status history write by client') then
    create policy "status history write by client"
    on public.application_status_history
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.loan_applications la
        join public.clients c on c.id = la.client_id
        where la.id = application_status_history.application_id
          and c.user_id = auth.uid()
      )
    );
  end if;
end $$;
