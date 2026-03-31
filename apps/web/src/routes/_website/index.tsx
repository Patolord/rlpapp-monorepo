import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import HeroSection from "@/components/website/HeroSection";
import SegmentosSection from "@/components/website/SegmentosSection";
import Services from "@/components/website/Services";
import Projects from "@/components/website/Projects";
import BenefitsSection from "@/components/website/benefits-section";
import FAQSection from "@/components/website/FAQSection";
import ContactSection from "@/components/website/ContactSection";

export const Route = createFileRoute("/_website/")({
  component: HomePage,
});

function HomePage() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) {
      navigate({ to: "/estoque" });
    }
  }, [isSignedIn, navigate]);

  return (
    <>
      <HeroSection />
      <SegmentosSection />
      <Services />
      <Projects />
      <BenefitsSection />
      <FAQSection />
      <ContactSection />
    </>
  );
}
