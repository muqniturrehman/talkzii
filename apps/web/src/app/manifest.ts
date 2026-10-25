import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Talkzi',
    short_name: 'Talkzi',
    description: 'Run your business on WhatsApp — shared inbox, broadcasts, chatbots and AI.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0A0A0F',
    theme_color: '#8B5CF6',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
