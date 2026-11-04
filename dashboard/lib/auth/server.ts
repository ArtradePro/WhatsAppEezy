import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfiguration } from './config';
export function serverAuth() {
  const config = authConfiguration();
  if (!config) return null;
  const store = cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values: Array<{ name: string; value: string; options: CookieOptions }>) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Middleware refreshes cookies before Server Components render. */ }
      },
    },
  });
}
