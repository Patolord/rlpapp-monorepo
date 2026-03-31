import { Outlet, createFileRoute } from "@tanstack/react-router";

import Footer from "@/components/website/Footer";
import Header from "@/components/website/Header";
import FloatingBubbleMenu from "@/components/website/FloatingBubbleMenu";

export const Route = createFileRoute("/_website")({
  component: WebsiteLayout,
});

function WebsiteLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <FloatingBubbleMenu />
    </>
  );
}
