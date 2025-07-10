import type { Metadata } from 'next';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v13-appRouter';

import './globals.css';

export const metadata: Metadata = {
  title: 'WebSocket Transceiver',
  description: 'Page for check data in socket packages',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
      </body>
    </html>
  );
}
