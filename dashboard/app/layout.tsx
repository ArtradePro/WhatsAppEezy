import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vendor Admin Dispatch & Catalog Dashboard | WhatsApp Commerce Aggregator',
  description:
    'Industrial high-contrast dispatch operations, stock inventory, and real-time WhatsApp delivery fulfillment console.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-industrial-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
