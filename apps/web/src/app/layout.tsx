import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Talkzi — Run your business on WhatsApp',
  description: 'Shared WhatsApp inbox, broadcasts, chatbots and AI on the official WhatsApp Cloud API.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
