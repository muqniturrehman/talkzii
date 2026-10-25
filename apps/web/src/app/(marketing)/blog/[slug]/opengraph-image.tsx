import { getPost } from '@/content/blog';
import { brandCard, OG_SIZE } from '@/lib/og';

export const alt = 'Talkzi blog';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function BlogOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  return brandCard({
    eyebrow: 'Blog',
    title: post?.title ?? 'Talkzi blog',
    subtitle: post?.excerpt ?? 'Guides for selling and supporting customers on WhatsApp.',
  });
}
