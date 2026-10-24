import { Footer } from '@/components/marketing/footer';
import { MotionProvider } from '@/components/marketing/motion';
import { Navbar } from '@/components/marketing/navbar';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <div className="relative flex min-h-dvh flex-col overflow-x-clip">
        <Navbar />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </MotionProvider>
  );
}
