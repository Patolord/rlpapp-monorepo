import { symbolDef } from "../lib/symbols";

/** Inline SVG rendering of a count symbol, same geometry as on the canvas. */
export function SymbolIcon({
  id,
  color,
  size = 14,
  className,
}: {
  id: string | undefined;
  color: string;
  size?: number;
  className?: string;
}) {
  const def = symbolDef(id);
  if (def.id === "dot") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        <title>{def.label}</title>
        <path d={def.paths[0]} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <title>{def.label}</title>
      <path d={def.paths[0]} fill="#fff" stroke="none" />
      {def.paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {def.fills?.map((d) => (
        <path key={d} d={d} fill={color} stroke="none" />
      ))}
    </svg>
  );
}
