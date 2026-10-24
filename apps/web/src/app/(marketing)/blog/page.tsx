import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@talkzi/ui/badge';
import { Reveal } from '@/components/marketing/motion';
import { Section, SectionHeading } from '@/components/marketing/section';
import { posts } from '@/content/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guides on the WhatsApp Business Platform, broadcasts, chatbots and customer support.',
};

export default function BlogPage() {
  return (
    <Section>
      <SectionHeading eyebrow="Blog" title="Guides for growing on WhatsApp" />
      <div className="grid gap-6 md:grid-cols-3">
        {posts.map((post, i) => (
          <Reveal key={post.slug} delay={i * 0.06}>
            <Link
              href={`/blog/${post.slug}`}
              className="glass group flex h-full flex-col rounded-2xl p-6 transition hover:-translate-y-0.5 hover:border-primary/50"
            >
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
              <h2 className="mt-4 text-lg font-semibold group-hover:text-primary">{post.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
              <p className="mt-6 text-xs text-muted-foreground">
                {new Date(post.date).toLocaleDateString('en-GB', { dateStyle: 'medium' })} · {post.readingMinutes} min read
              </p>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
