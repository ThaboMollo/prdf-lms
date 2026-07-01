-- DRAFT — Province & spatial classification for regulatory (NCR / SEDFA) reporting
-- Review before applying. Adds structured location fields to public.clients so the
-- admin-ui "Province Breakdown" report (and RFQ "Spatial: Rural/Townships/City"
-- preference points) can be sourced from data instead of the free-text address.
--
-- Companion to phase8_1_patch.sql (gender / HDP / is_rural demographic fields).
-- After applying, the onboarding form (client-ui ApplyPage) must be updated to
-- capture province + spatial_type, otherwise these columns stay null.

-- 1. Province: one of the 9 South African provinces (nullable until backfilled).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS province text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_province_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_province_check
  CHECK (province IS NULL OR province IN (
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
    'Western Cape'
  ));

-- 2. Spatial type: RFQ preference-point categories (Rural / Township / City).
--    Superset of the existing is_rural boolean; kept additive so existing data
--    and the is_rural-based report continue to work.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS spatial_type text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_spatial_type_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_spatial_type_check
  CHECK (spatial_type IS NULL OR spatial_type IN ('Rural', 'Township', 'City'));

-- 3. Backfill spatial_type from the existing is_rural flag where unambiguous.
UPDATE public.clients
  SET spatial_type = 'Rural'
  WHERE spatial_type IS NULL AND is_rural = true;

-- 4. Indexes to keep the breakdown aggregations cheap.
CREATE INDEX IF NOT EXISTS idx_clients_province ON public.clients (province);
CREATE INDEX IF NOT EXISTS idx_clients_spatial_type ON public.clients (spatial_type);

-- Notify postgrest to reload the schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';
