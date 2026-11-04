'use client';
import React, { useState } from 'react';
import { browserAuth } from '../../lib/auth/browser';
import { authConfiguration } from '../../lib/auth/config';
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = Boolean(authConfiguration());
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { error } = await browserAuth().auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setError('Sign-in failed. Check your email and password.'); return; }
      window.location.assign('/');
    } catch { setError('Sign-in is unavailable. Please try again later.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center p-6 bg-[#0B141A]">
    <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
      <img src="/branding/whatsappeezy-logo.png" alt="WhatsAppEezy" width={104} height={104} className="mb-5 rounded-2xl" />
      <p className="text-emerald-400 font-bold mb-3">WhatsAppEezy</p>
      <h1 className="text-3xl font-bold mb-3">Sign in to your businesses</h1>
      <p className="text-slate-300 mb-6">Use your account to manage the companies you have access to.</p>
      {!configured && <p role="status" className="rounded-lg bg-amber-950/60 border border-amber-600 p-4 text-amber-100 mb-5">Sign-in setup is not complete. Your platform owner needs to connect the account service and assign your company access.</p>}
      <form onSubmit={signIn} className="space-y-4">
        <label className="block">Email address<input type="email" autoComplete="username" required disabled={!configured || busy} value={email} onChange={event => setEmail(event.target.value)} className="block w-full mt-2 rounded-lg bg-slate-950 border border-slate-600 px-3 py-3 disabled:opacity-50" /></label>
        <label className="block">Password<input type="password" autoComplete="current-password" required disabled={!configured || busy} value={password} onChange={event => setPassword(event.target.value)} className="block w-full mt-2 rounded-lg bg-slate-950 border border-slate-600 px-3 py-3 disabled:opacity-50" /></label>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button type="submit" disabled={!configured || busy} className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-slate-950 font-bold disabled:opacity-40">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-5 text-sm text-slate-400">New accounts receive access only after the platform owner assigns a company.</p>
    </section>
  </main>;
}
