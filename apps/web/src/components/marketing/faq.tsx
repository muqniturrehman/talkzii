import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@talkzi/ui/accordion';
import { faqs } from '@/content/marketing';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <Reveal className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="glass rounded-2xl px-6">
          {faqs.map((item, index) => (
            <AccordionItem key={item.q} value={`faq-${index}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
      <script
        type="application/ld+json"
        // FAQ rich results
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />
    </Section>
  );
}
