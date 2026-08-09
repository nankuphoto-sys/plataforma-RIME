import { AudienceTabs } from "@/components/marketing/AudienceTabs";
import { FAQ } from "@/components/marketing/FAQ";
import { Features } from "@/components/marketing/Features";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PricingStrip } from "@/components/marketing/PricingStrip";
import { ProductPreviewSection } from "@/components/marketing/ProductPreviewSection";
import { SpecialtyGrid } from "@/components/marketing/SpecialtyGrid";
import { StatsBar } from "@/components/marketing/StatsBar";
import { Testimonials } from "@/components/marketing/Testimonials";

export default function HomePage() {
  return (
    <>
      <MarketingHeader />
      <main>
        <Hero />
        <ProductPreviewSection />
        <StatsBar />
        <AudienceTabs />
        <SpecialtyGrid />
        <Features />
        <PricingStrip />
        <Testimonials />
        <FAQ />
        <FinalCta />
      </main>
      <MarketingFooter />
    </>
  );
}
