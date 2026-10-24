import type { Metadata } from 'next';
import { CompareTable } from '@/components/marketing/compare-table';
import { CtaBand } from '@/components/marketing/cta-band';
import { Reveal } from '@/components/marketing/motion';
import { Section } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Compare',
  description: 'Talkzi vs Wati, AiSensy, WhatChimp and Interakt: PKR pricing, Urdu, local payments, agency mode, AI and open APIs.',
};

const reasons = [
  {
    title: 'Priced for Pakistan',
    body: 'Plans in PKR with JazzCash and Easypaisa, so you never fight international card limits or currency swings.',
  },
  {
    title: 'Urdu-ready',
    body: 'Roman Urdu and Urdu work everywhere — inbox search, canned replies, chatbot keywords and AI suggestions.',
  },
  {
    title: 'Open by default',
    body: 'Webhooks and the REST API are included on Pro, not locked behind enterprise contracts.',
  },
];

export default function ComparePage() {
  return (
    <>
      <CompareTable />
      <Section className="pt-0">
        <div className="grid gap-6 md:grid-cols-3">
          {reasons.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.08}>
              <article className="glass h-full rounded-2xl p-6">
                <h2 className="text-lg font-semibold">{r.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
