import * as React from 'react';
import { siteConfig } from '@/config/site';

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

/**
 * Long-form document layout with a sticky table of contents.
 * NOTE: Legal copy is a strong starting template — have counsel review it
 * for your entity and jurisdictions before launch.
 */
export function LegalPage({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto mb-12 max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated {new Date(siteConfig.legalUpdatedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          </p>
          <div className="mt-6 text-pretty text-muted-foreground">{intro}</div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24 space-y-1 text-sm">
              <p className="mb-2 font-semibold">On this page</p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </nav>

          <article className="prose-talkzi max-w-3xl space-y-10">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="mb-3 text-xl font-semibold">
                  {index + 1}. {section.title}
                </h2>
                <div className="space-y-3 leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:space-y-1.5">
                  {section.content}
                </div>
              </section>
            ))}
            {children}
          </article>
        </div>
      </div>
    </div>
  );
}
