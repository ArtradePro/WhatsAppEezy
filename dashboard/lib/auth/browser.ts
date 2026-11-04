import { createBrowserClient } from '@supabase/ssr';
import { authConfiguration } from './config';
export function browserAuth() {
  const config = authConfiguration();
  if (!config) throw new Error('Sign-in has not been connected yet. Please contact the platform owner.');
  return createBrowserClient(config.url, config.key);
}
