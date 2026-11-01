import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
  hint?: string;
  children: ReactNode;
}

export function IconButton({ active, label, hint, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "flex h-9 w-9 items-center justify-center rounded-md text-neutral-300 transition-colors",
        "hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/60",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

export function Button({ variant = "ghost", className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:opacity-40",
        // press feedback: a slight shrink while held (the `scale` property, so a `transform` on
        // the button is left alone); disabled buttons stay still
        "transition-[color,background-color,border-color,box-shadow,scale] duration-[160ms] ease-out active:not-disabled:scale-[0.97]",
        variant === "primary"
          ? "bg-orange-500 text-neutral-950 hover:bg-orange-400"
          : "bg-neutral-800 text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700",
        className,
      )}
      {...rest}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 font-mono text-[11px] text-neutral-300">
      {children}
    </kbd>
  );
}

interface BackdropProps extends HTMLAttributes<HTMLDivElement> {
  /** Where the panel sits: centred (default) or near the top (palette style). */
  align?: "center" | "top";
  children: ReactNode;
}

/**
 * The layer that positions a dialog or the palette over the whole app. It is transparent and
 * lets pointer events through, so the drawing and the panels stay usable while a dialog is open;
 * the panel inside it must opt back in with `pointer-events-auto`.
 */
export function Backdrop({ align = "center", className, ...rest }: BackdropProps) {
  return (
    <div
      className={clsx(
        "pointer-events-none absolute inset-0 z-40 flex justify-center",
        align === "top" ? "items-start pt-16" : "items-center",
        className,
      )}
      {...rest}
    />
  );
}
