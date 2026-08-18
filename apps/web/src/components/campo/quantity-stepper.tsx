import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Diminuir quantidade"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-5" />
      </Button>
      <span className="min-w-10 text-center text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Aumentar quantidade"
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-5" />
      </Button>
    </div>
  );
}
