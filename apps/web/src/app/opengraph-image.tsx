import { brandCard, OG_SIZE } from '@/lib/og';

export const alt = 'Talkzi — Run your business on WhatsApp';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return brandCard({
    eyebrow: 'WhatsApp for business',
    title: 'Run your business on WhatsApp.',
    subtitle: 'Shared inbox, broadcasts, chatbots and AI replies for teams in Pakistan and beyond.',
  });
}
