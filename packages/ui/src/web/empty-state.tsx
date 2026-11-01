import * as React from "react";

import { cn } from "./lib/cn";

type EmptyStateVariant =
  | "default"
  | "inline"
  | "dropzone"
  /** @deprecated use "default" */
  | "card"
  /** @deprecated use "default" */
  | "plain"
  /** @deprecated use "dropzone" */
  | "dashed";

export interface EmptyStateProps {
  /** Lucide icon (rendered at 20px). Ignored by the "inline" variant. */
  icon?: React.ReactNode;
  /** What is missing ("Nenhum equipamento cadastrado"). Not used by "inline". */
  title?: string;
  /** The next step. For "inline", the whole sentence. */
  description?: React.ReactNode;
  /**
   * default/dropzone: up to two Buttons (one primary, one outline).
   * inline: one link (e.g. "Limpar filtros"), styled as a primary link.
   */
  action?: React.ReactNode;
  className?: string;
  /**
   * - "default": a list/table/page with nothing added yet. Place it inside
   *   the card or panel that would hold the content (no extra Card).
   * - "inline": a filter or search with no results; a single line.
   * - "dropzone": an area filled by adding something (QR, photos, PDFs).
   *
   * Deprecated aliases: "card" and "plain" → "default", "dashed" → "dropzone".
   */
  variant?: EmptyStateVariant;
}

function normalizeVariant(
  variant: EmptyStateVariant,
): "default" | "inline" | "dropzone" {
  if (variant === "card" || variant === "plain") return "default";
  if (variant === "dashed") return "dropzone";
  return variant;
}

/**
 * "Nothing here yet" message: compact default, single-line inline (filters
 * with no results) and a dashed dropzone. Don't wrap it in an extra Card.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const v = normalizeVariant(variant);

  if (v === "inline") {
    return (
      <div
        data-slot="empty-state"
        data-variant="inline"
        className={cn(
          "px-[20px] py-[20px] text-sm text-muted-foreground",
          "[&_a]:ml-1 [&_a]:font-medium [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-4",
          "[&_button]:ml-1 [&_button]:font-medium [&_button]:text-primary [&_button:hover]:underline [&_button:hover]:underline-offset-4",
          className,
        )}
      >
        {description ?? title}
        {action ? <> {action}</> : null}
      </div>
    );
  }

  const isDropzone = v === "dropzone";

  return (
    <div
      data-slot="empty-state"
      data-variant={v}
      className={cn(
        "text-center",
        isDropzone
          ? "m-[16px] rounded-lg border-[1.5px] border-dashed border-control-border bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-[length:16px_16px] px-[16px] py-[32px]"
          : "px-[16px] py-[36px]",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "mx-auto mb-[12px] flex size-[40px] items-center justify-center border border-control-border bg-card shadow-xs [&_svg]:size-[20px]",
            isDropzone
              ? "rounded-full text-primary"
              : "rounded-md text-muted-foreground",
          )}
        >
          {icon}
        </div>
      ) : null}
      {title ? (
        <p className="m-0 text-[15px] leading-[22px] font-semibold text-foreground">
          {title}
        </p>
      ) : null}
      {description ? (
        <p className="mt-[2px] text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-[16px] flex flex-wrap justify-center gap-[8px]">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
