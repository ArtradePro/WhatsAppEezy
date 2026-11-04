import { redirect } from 'next/navigation';
import VendorDashboard from '../components/vendor-dashboard';
import { dashboardAccess, AccessError } from '../lib/auth/access';
import type { Vendor } from '../lib/types';
export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  try {
    const access = await dashboardAccess();
    let query = access.client.from('vendors').select('id,business_name,slug,whatsapp_number,contact_email,business_type,is_active');
    if (!access.isPlatformAdmin) query = query.in('id', access.roles.map(role => role.vendor_id));
    const { data, error } = await query;
    if (error || !data?.length) redirect('/access-denied');
    const initialVendors: Vendor[] = data.map(company => ({
      ...company, contact_email: company.contact_email || '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_branch_code: '',
      base_location_lon: 0, base_location_lat: 0, max_delivery_radius_km: 0, base_delivery_fee: 0, per_km_rate: 0, commission_rate: 0, is_active: company.is_active === true,
    }));
    return <VendorDashboard initialVendors={initialVendors} access={{ email: access.email, isPlatformAdmin: access.isPlatformAdmin, roles: access.roles }} />;
  } catch (error) {
    if (error instanceof AccessError) redirect(error.status === 401 ? '/login' : '/access-denied');
    throw error;
  }
}
