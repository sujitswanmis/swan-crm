import './globals.css';
import { Database, LayoutDashboard, Users, Settings, Bell, Search } from 'lucide-react';

export const metadata = {
  title: 'Enterprise CRM',
  description: 'High-performance CRM for handling millions of records.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Swan CRM',
  },
};

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
