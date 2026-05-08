import { AuthenticateWithRedirectCallback } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/sso-callback")({
  component: SsoCallbackPage,
});

function SsoCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d]">
      <AuthenticateWithRedirectCallback />
      <Loader2 className="size-8 animate-spin text-white/60" />
    </div>
  );
}
