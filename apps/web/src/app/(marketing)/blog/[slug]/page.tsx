import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPost, posts } from '@/content/blog';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { type: 'article', title: post.title, description: post.excerpt, publishedTime: post.date },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <article className="px-4 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-2xl">
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All posts
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance">{post.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {post.author} · {new Date(post.date).toLocaleDateString('en-GB', { dateStyle: 'long' })} · {post.readingMinutes} min read
        </p>
        <div className="mt-10 space-y-5 text-lg leading-relaxed">
          {post.body.map((block, i) => {
            if (block.type === 'h2') {
              return (
                <h2 key={i} className="pt-4 text-2xl font-semibold">
                  {block.text}
                </h2>
              );
            }
            if (block.type === 'li') {
              return (
                <p key={i} className="flex gap-3 text-muted-foreground">
                  <span className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {block.text}
                </p>
              );
            }
            return (
              <p key={i} className="text-muted-foreground">
                {block.text}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
