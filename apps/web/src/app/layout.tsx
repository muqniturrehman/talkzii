import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { ThemeProvider } from '@talkzi/ui/theme-provider';
import { Toaster } from '@talkzi/ui/sonner';
import { TooltipProvider } from '@talkzi/ui/tooltip';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'Talkzi — Run your business on WhatsApp',
    template: '%s · Talkzi',
  },
  description:
    'Shared WhatsApp inbox, broadcasts, chatbots and AI — built on the official WhatsApp Business Cloud API. PKR pricing, Urdu-ready, made in Pakistan.',
  applicationName: 'Talkzi',
  keywords: ['WhatsApp Business API', 'WhatsApp Cloud API', 'shared inbox', 'WhatsApp broadcast', 'chatbot', 'Pakistan'],
  openGraph: {
    type: 'website',
    siteName: 'Talkzi',
    title: 'Talkzi — Run your business on WhatsApp',
    description: 'Sales, support and marketing on the official WhatsApp Cloud API.',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0F' },
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
