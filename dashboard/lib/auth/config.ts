export function authConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key || url.includes('your-')) return null;
  try { if (new URL(url).protocol !== 'https:') return null; } catch { return null; }
  return { url, key };
}
