import './globals.css';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';

export const metadata = {
  title: 'SuPuja Creations',
  description: 'Enterprise CRM & Business Operations - SuPuja Creations',
  applicationName: 'SuPuja Creations',
  icons: {
    icon: [
      { url: '/supuja-logo.png', sizes: 'any', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/supuja-logo.png',
    apple: '/icon-192x192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SuPuja Creations',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SuPuja Creations" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
