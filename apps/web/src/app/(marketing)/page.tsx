import { CompareTable } from '@/components/marketing/compare-table';
import { CtaBand } from '@/components/marketing/cta-band';
import { Faq } from '@/components/marketing/faq';
import { FeaturesGrid } from '@/components/marketing/features-grid';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { PricingSection } from '@/components/marketing/pricing-section';
import { Testimonials } from '@/components/marketing/testimonials';
import { TrustRow } from '@/components/marketing/trust-row';

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustRow />
      <FeaturesGrid />
      <HowItWorks />
      <CompareTable />
      <PricingSection />
      <Testimonials />
      <Faq />
      <CtaBand />
    </>
  );
}
