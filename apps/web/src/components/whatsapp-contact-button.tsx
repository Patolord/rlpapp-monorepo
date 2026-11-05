import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { openCompanyWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type WhatsAppContactButtonProps = {
  className?: string;
  prefilledText?: string;
  children?: ReactNode;
};

export function WhatsAppContactButton({
  className,
  prefilledText,
  children = "Falar no WhatsApp",
}: WhatsAppContactButtonProps) {
  return (
    <button
      type="button"
      aria-label="Falar no WhatsApp"
      onClick={() => openCompanyWhatsApp(prefilledText)}
      className={cn(
        "inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <MessageCircle aria-hidden className="size-4" />
      {children}
    </button>
  );
}
