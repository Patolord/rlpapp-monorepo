import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
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
