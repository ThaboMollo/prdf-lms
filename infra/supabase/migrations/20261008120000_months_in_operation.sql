-- Months in operation — a companion to loan_applications.years_in_operation.
--
-- The wizard only ever asked for whole years, so a business trading for eight
-- months had to enter 0 (the manual literally instructed this, §7.2). That
-- reads as "not trading yet" to an assessor and loses the one piece of
-- information that distinguishes a pre-revenue idea from a going concern most
-- of a year old. PRDF's reviewer asked for months alongside years in the v1.1
-- manual review.
--
-- Months beyond the whole years, so the application-layer bound is 0-11
-- (packages/domain/constraints.ts). No CHECK constraint here, matching
-- years_in_operation: every other numeric bound on this table is enforced in
-- the DTO and the zod schema rather than the database, and splitting the
-- enforcement across two layers is how they drifted apart before.
--
-- Nullable with no default, so existing rows stay distinguishable: null means
-- "never asked", not "zero months".

begin;

alter table public.loan_applications
  add column if not exists months_in_operation integer;

comment on column public.loan_applications.months_in_operation is
  'Months in operation beyond years_in_operation (0-11). Null = not captured.';

commit;
