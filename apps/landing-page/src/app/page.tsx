import type { Metadata } from "next";
import HeroSection from "@/components/HeroSection";
import Services from "@/components/Services";
import Projects from "@/components/Projects";
import BenefitsSection from "@/components/benefits-section";
import SegmentosSection from "@/components/SegmentosSection";
import FAQSection from "@/components/FAQSection";
import ContactSection from "@/components/ContactSection";
import JsonLd from "@/components/JsonLd";
import { homeFaqs } from "@/data/faq";
import {
  faqJsonLd,
  jsonLdGraph,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <JsonLd
        data={jsonLdGraph(
          organizationJsonLd(),
          websiteJsonLd(),
          faqJsonLd(homeFaqs)
        )}
      />
      <HeroSection />
      <BenefitsSection />
      <SegmentosSection />
      <Services />
      <Projects />
      <FAQSection />
      <ContactSection />
    </main>
  );
}
