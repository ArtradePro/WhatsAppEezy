import { serverAuth } from './server';
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function dashboardAccess() {
  const client = serverAuth();
  if (!client) throw new AccessError(503, 'Sign-in setup is not complete.');
  const { data: identity, error } = await client.auth.getUser();
  if (error || !identity.user) throw new AccessError(401, 'Please sign in.');
  // Only verified identity and database records confer access. User metadata never grants roles.
  const [admin, memberships] = await Promise.all([
    client.from('platform_administrators').select('user_id').eq('user_id', identity.user.id).maybeSingle(),
    client.from('merchant_memberships').select('vendor_id,role').eq('user_id', identity.user.id),
  ]);
  if (admin.error || memberships.error) throw new AccessError(503, 'Company access setup is not complete.');
  const isPlatformAdmin = Boolean(admin.data);
  const roles = (memberships.data || []) as Array<{ vendor_id: string; role: string }>;
  if (!isPlatformAdmin && roles.length === 0) throw new AccessError(403, 'No company access has been assigned to this account.');
  return { client, userId: identity.user.id, email: identity.user.email || '', isPlatformAdmin, roles };
}
export async function authenticatedBackendToken() {
  const access = await dashboardAccess();
  // getSession is used only for transport after getUser verified the identity above.
  const { data } = await access.client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AccessError(401, 'Please sign in again.');
  return { ...access, token };
}
