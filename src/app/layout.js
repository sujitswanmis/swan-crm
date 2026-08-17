import './globals.css';
import { Database, LayoutDashboard, Users, Settings, Bell, Search } from 'lucide-react';

export const metadata = {
  title: 'SuPuja Creations CRM',
  description: 'Enterprise CRM & Business Operations - SuPuja Creations',
  icons: {
    icon: [
      { url: '/supuja-logo.png', sizes: 'any', type: 'image/png' },
      { url: '/icon.png', sizes: 'any', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/supuja-logo.png',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SuPuja Creations',
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
