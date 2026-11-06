import { formatCurrency } from "@rlpapp/shared";

export function TotalStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums ${className ?? ""}`}>
        {formatCurrency(value)}
      </span>
    </span>
  );
}
