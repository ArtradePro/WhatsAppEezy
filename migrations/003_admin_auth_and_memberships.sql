-- Apply to the configured Supabase project. No accounts or permissions are granted by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_administrators (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.merchant_memberships (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','staff','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, vendor_id)
);
ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_administrators, public.merchant_memberships FROM anon, authenticated;
GRANT SELECT ON public.platform_administrators, public.merchant_memberships TO authenticated;
DROP POLICY IF EXISTS read_own_admin_status ON public.platform_administrators;
CREATE POLICY read_own_admin_status ON public.platform_administrators FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS read_own_memberships ON public.merchant_memberships;
CREATE POLICY read_own_memberships ON public.merchant_memberships FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Dashboard reads only non-financial company columns. Database service credentials remain server-only.
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendors FROM anon, authenticated;
GRANT SELECT (id,business_name,slug,whatsapp_number,contact_email,business_type) ON public.vendors TO authenticated;
DROP POLICY IF EXISTS read_assigned_companies ON public.vendors;
CREATE POLICY read_assigned_companies ON public.vendors FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.platform_administrators a WHERE a.user_id = (SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.merchant_memberships m WHERE m.user_id = (SELECT auth.uid()) AND m.vendor_id = vendors.id)
);
DROP POLICY IF EXISTS restrict_company_visibility ON public.vendors;
CREATE POLICY restrict_company_visibility ON public.vendors AS RESTRICTIVE FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.platform_administrators a WHERE a.user_id = (SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.merchant_memberships m WHERE m.user_id = (SELECT auth.uid()) AND m.vendor_id = vendors.id)
);
COMMIT;
