import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** A rectangular duct elbow. Lucide's closest icon (AirVent) reads as an air-conditioner. */
export function DuctIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="M3 6h10a7 7 0 0 1 7 7v8" />
      <path d="M3 12h10a1 1 0 0 1 1 1v8" />
      <path d="M3 6v6" />
      <path d="M14 21h6" />
    </svg>
  );
}
