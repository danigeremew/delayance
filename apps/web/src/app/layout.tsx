import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';
import './auth-pages.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Delayance',
  description: 'AI Document Workspace',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/delayance-logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body
        className={`${sans.className} min-h-screen bg-[var(--dl-bg)] text-[var(--dl-fg)] antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
