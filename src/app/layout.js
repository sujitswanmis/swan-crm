import './globals.css';
import { Database, LayoutDashboard, Users, Settings, Bell, Search } from 'lucide-react';

export const metadata = {
  title: 'Enterprise CRM',
  description: 'High-performance CRM for handling millions of records.',
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
