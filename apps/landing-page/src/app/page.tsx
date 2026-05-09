"use client";

import HeroSection from "@/components/HeroSection";
import Services from "@/components/Services";
import Projects from "@/components/Projects";
import BenefitsSection from "@/components/benefits-section";
import SegmentosSection from "@/components/SegmentosSection";
import FAQSection from "@/components/FAQSection";
import ContactSection from "@/components/ContactSection";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
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
