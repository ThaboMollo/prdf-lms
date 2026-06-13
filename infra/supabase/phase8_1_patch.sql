-- Add demographic and compliance fields to public.clients

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS is_hdp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_rural boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_black_women_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sa_citizenship_percentage numeric,
  ADD COLUMN IF NOT EXISTS is_director_operational boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cipc_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sars_tax_pin text,
  ADD COLUMN IF NOT EXISTS insolvent_or_debt_review boolean DEFAULT false;

-- Notify postgrest to reload the schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';
