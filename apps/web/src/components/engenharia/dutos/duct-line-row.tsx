import { useRef, useState } from "react";
import {
  EXTERNAL_INSULATION_LABELS,
  FLANGE_LABELS,
  INTERNAL_INSULATION_LABELS,
  type DuctLineInput,
  type ExternalInsulation,
  type FlangeType,
  type InternalInsulation,
} from "@rlpapp/shared";
import {
  Box,
  CircleSlash,
  Copy,
  GripHorizontal,
  Layers,
  PaintBucket,
  Paintbrush,
  Square,
  Trash2,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DuctLineRowModel = DuctLineInput & { key: string };

function formatSide(value: number): string {
  if (!value) return "";
  return String(value).replace(".", ",");
}

function parsePositive(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isIncompleteNumber(value: string): boolean {
  return value === "" || /[.,]$/.test(value);
}

/** Aceita 40x25, 40×25 ou 40x25x3 (seção + comprimento). */
export function parseDuctStamp(raw: string): Partial<
  Pick<DuctLineInput, "largerSideCm" | "smallerSideCm" | "lengthM">
> {
  const cleaned = raw.trim().replace(/,/g, ".").replace(/[×X*]/g, "x");
  const parts = cleaned
    .split(/x/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const nums = parts
    .map((part) => Number.parseFloat(part.replace(/[^\d.]/g, "")))
    .filter((num) => Number.isFinite(num) && num >= 0);

  if (nums.length >= 3) {
    return orderedSides(nums[0]!, nums[1]!, nums[2]);
  }
  if (nums.length === 2) {
    return orderedSides(nums[0]!, nums[1]!);
  }
  if (nums.length === 1) {
    return { largerSideCm: nums[0] };
  }
  return {};
}

function orderedSides(
  a: number,
  b: number,
  lengthM?: number
): Partial<Pick<DuctLineInput, "largerSideCm" | "smallerSideCm" | "lengthM">> {
  const largerSideCm = Math.max(a, b);
  const smallerSideCm = Math.min(a, b);
  return lengthM == null
    ? { largerSideCm, smallerSideCm }
    : { largerSideCm, smallerSideCm, lengthM };
}

function AngleBracketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path fill="currentColor" d="M3.2 2.8h3.1v7h7.5v3.4H3.2V2.8z" />
    </svg>
  );
}

function CleatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M2 4.4h12v2.1H2V4.4zm0 5.1h12v2.1H2V9.5z"
      />
    </svg>
  );
}

type Glyph = LucideIcon | typeof AngleBracketIcon;

const EXTERNAL_OPTIONS: Array<{ value: ExternalInsulation; icon: Glyph }> = [
  { value: "none", icon: CircleSlash },
  { value: "manta", icon: Layers },
  { value: "isopor", icon: Box },
  { value: "placa", icon: Square },
  { value: "pintura", icon: Paintbrush },
];

const INTERNAL_OPTIONS: Array<{ value: InternalInsulation; icon: Glyph }> = [
  { value: "none", icon: CircleSlash },
  { value: "bidim", icon: GripHorizontal },
  { value: "flexiliner", icon: Waves },
];

const FLANGE_OPTIONS: Array<{ value: FlangeType; icon: Glyph }> = [
  { value: "none", icon: CircleSlash },
  { value: "powermatic", icon: CleatIcon },
  { value: "cantoneira", icon: AngleBracketIcon },
];

function SectionGlyph({
  larger,
  smaller,
}: {
  larger: number;
  smaller: number;
}) {
  const wide = Math.max(larger, smaller, 1);
  const short = Math.max(Math.min(larger || 1, smaller || 1), 1);
  const ratio = wide / short;
  const height = Math.round(
    Math.min(12, Math.max(6, 14 / Math.min(ratio, 2.6)))
  );
  const empty = larger <= 0 && smaller <= 0;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 border border-current",
        empty ? "opacity-30" : "opacity-80"
      )}
      style={{ width: 14, height }}
    />
  );
}

const stampInputClass =
  "h-6 w-11 border-0 bg-transparent px-1 text-center font-mono text-xs tabular-nums shadow-none focus-visible:border-0 focus-visible:ring-0";

const stampClusterClass =
  "flex h-7 items-center gap-1 rounded-md border border-zinc-300/90 bg-[#F4F6F7] px-1.5 focus-within:border-zinc-500 focus-within:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:focus-within:bg-zinc-950";

function IconRadioGroup<T extends string>({
  value,
  options,
  labels,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; icon: Glyph }>;
  labels: Record<T, string>;
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-zinc-300/90 bg-[#EEF0F2] p-px dark:border-zinc-700 dark:bg-zinc-900/80"
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const index = options.findIndex((option) => option.value === value);
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex =
          (index + delta + options.length) % options.length;
        const next = options[nextIndex];
        if (!next) return;
        onChange(next.value);
        const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="radio"]'
        );
        buttons?.[nextIndex]?.focus();
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[option.value]}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-[3px] text-zinc-500 outline-none transition-colors",
                "hover:bg-white hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                "focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring",
                selected &&
                  "bg-[#243036] text-white shadow-sm hover:bg-[#243036] hover:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-100"
              )}
              onClick={() => onChange(option.value)}
            >
              <Icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{labels[option.value]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function IconFlag({
  pressed,
  label,
  icon: Icon,
  disabled,
  onPressed,
}: {
  pressed: boolean;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onPressed: (next: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        disabled={disabled}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-[3px] border border-zinc-300/90 bg-[#EEF0F2] text-zinc-500 outline-none transition-colors",
          "hover:bg-white hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-800",
          "focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-35",
          pressed &&
            "border-transparent bg-[#243036] text-white hover:bg-[#243036] hover:text-white dark:bg-zinc-100 dark:text-zinc-900"
        )}
        onClick={() => onPressed(!pressed)}
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type DuctLineRowProps = {
  line: DuctLineRowModel;
  gauge: string | null | undefined;
  canRemove: boolean;
  onChange: (patch: Partial<DuctLineInput>) => void;
  onRemove: () => void;
};

export function DuctLineRow({
  line,
  gauge,
  canRemove,
  onChange,
  onRemove,
}: DuctLineRowProps) {
  const smallerRef = useRef<HTMLInputElement>(null);
  const lengthRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [largerText, setLargerText] = useState<string | null>(null);
  const [smallerText, setSmallerText] = useState<string | null>(null);
  const [lengthText, setLengthText] = useState<string | null>(null);

  function commitSides(largerRaw: string, smallerRaw: string) {
    const a = parsePositive(largerRaw);
    const b = parsePositive(smallerRaw);
    if (a > 0 && b > 0) {
      onChange(orderedSides(a, b));
      return;
    }
    onChange({ largerSideCm: a, smallerSideCm: b });
  }

  function applyStamp(raw: string): boolean {
    const parsed = parseDuctStamp(raw);
    if (parsed.smallerSideCm == null && parsed.lengthM == null) {
      return false;
    }
    onChange(parsed);
    setLargerText(null);
    setSmallerText(null);
    if (parsed.lengthM != null) {
      setLengthText(null);
      queueMicrotask(() => {
        lengthRef.current?.focus();
        lengthRef.current?.select();
      });
    } else {
      queueMicrotask(() => {
        smallerRef.current?.focus();
        smallerRef.current?.select();
      });
    }
    return true;
  }

  return (
    <div className="flex min-w-max items-center gap-2 py-1">
      <Input
        aria-label="TAG"
        autoComplete="off"
        className="h-7 w-[4.75rem] px-2 font-mono text-xs"
        value={line.tag ?? ""}
        onChange={(event) => onChange({ tag: event.target.value })}
      />

      <div ref={sectionRef} className={stampClusterClass}>
        <SectionGlyph
          larger={line.largerSideCm}
          smaller={line.smallerSideCm}
        />
        <Input
          aria-label="Lado maior, cm"
          inputMode="decimal"
          autoComplete="off"
          placeholder="40"
          className={stampInputClass}
          value={largerText ?? formatSide(line.largerSideCm)}
          onFocus={() => setLargerText(formatSide(line.largerSideCm))}
          onChange={(event) => {
            const next = event.target.value;
            if (/[x×X*]/i.test(next)) {
              if (!applyStamp(next)) {
                setLargerText(next.replace(/[x×X*]/g, ""));
                smallerRef.current?.focus();
                smallerRef.current?.select();
              }
              return;
            }
            setLargerText(next);
            if (!isIncompleteNumber(next)) {
              onChange({ largerSideCm: parsePositive(next) });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "x" || event.key === "X" || event.key === "×") {
              event.preventDefault();
              smallerRef.current?.focus();
              smallerRef.current?.select();
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (applyStamp(text)) {
              event.preventDefault();
            }
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && sectionRef.current?.contains(next)) {
              setLargerText(null);
              return;
            }
            commitSides(
              largerText ?? formatSide(line.largerSideCm),
              smallerText ?? formatSide(line.smallerSideCm)
            );
            setLargerText(null);
            setSmallerText(null);
          }}
        />
        <span className="select-none text-[11px] font-medium text-zinc-400">
          ×
        </span>
        <Input
          ref={smallerRef}
          aria-label="Lado menor, cm"
          inputMode="decimal"
          autoComplete="off"
          placeholder="25"
          className={stampInputClass}
          value={smallerText ?? formatSide(line.smallerSideCm)}
          onFocus={() => setSmallerText(formatSide(line.smallerSideCm))}
          onChange={(event) => {
            const next = event.target.value;
            setSmallerText(next);
            if (!isIncompleteNumber(next)) {
              onChange({ smallerSideCm: parsePositive(next) });
            }
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && sectionRef.current?.contains(next)) {
              setSmallerText(null);
              return;
            }
            commitSides(
              largerText ?? formatSide(line.largerSideCm),
              smallerText ?? event.currentTarget.value
            );
            setLargerText(null);
            setSmallerText(null);
          }}
        />
        <span className="select-none pr-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          cm
        </span>
      </div>

      <div className={stampClusterClass}>
        <Input
          ref={lengthRef}
          aria-label="Comprimento, m"
          inputMode="decimal"
          autoComplete="off"
          placeholder="3"
          className={cn(stampInputClass, "w-12")}
          value={lengthText ?? formatSide(line.lengthM)}
          onFocus={() => setLengthText(formatSide(line.lengthM))}
          onChange={(event) => {
            const next = event.target.value;
            setLengthText(next);
            if (!isIncompleteNumber(next)) {
              onChange({ lengthM: parsePositive(next) });
            }
          }}
          onBlur={() => {
            const raw = lengthText ?? formatSide(line.lengthM);
            onChange({ lengthM: parsePositive(raw) });
            setLengthText(null);
          }}
        />
        <span className="select-none pr-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          m
        </span>
      </div>

      <IconRadioGroup
        value={line.externalInsulation}
        options={EXTERNAL_OPTIONS}
        labels={EXTERNAL_INSULATION_LABELS}
        ariaLabel="Isolamento externo"
        onChange={(externalInsulation) => onChange({ externalInsulation })}
      />
      <IconRadioGroup
        value={line.internalInsulation}
        options={INTERNAL_OPTIONS}
        labels={INTERNAL_INSULATION_LABELS}
        ariaLabel="Isolamento interno"
        onChange={(internalInsulation) => onChange({ internalInsulation })}
      />
      <IconRadioGroup
        value={line.flange}
        options={FLANGE_OPTIONS}
        labels={FLANGE_LABELS}
        ariaLabel="Flange"
        onChange={(flange) => onChange({ flange })}
      />

      <div className="inline-flex gap-px">
        <IconFlag
          pressed={line.reclad}
          label="Rechapeado"
          icon={Copy}
          onPressed={(reclad) =>
            onChange({ reclad, paintReclad: reclad ? line.paintReclad : false })
          }
        />
        <IconFlag
          pressed={line.paintReclad}
          label="Pintura do rechapeado"
          icon={PaintBucket}
          disabled={!line.reclad}
          onPressed={(paintReclad) => onChange({ paintReclad })}
        />
      </div>

      <span className="w-9 shrink-0 text-center font-mono text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
        {gauge ? `#${gauge}` : "—"}
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!canRemove}
        aria-label="Remover trecho"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function DuctLinesHeader() {
  return (
    <div className="flex min-w-max items-center gap-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
      <span className="w-[4.75rem] px-1">TAG</span>
      <span className="w-[10.75rem] px-1">Seção</span>
      <span className="w-[4.25rem] px-1">Comp.</span>
      <span className="w-[9.1rem] px-1">Isol. ext.</span>
      <span className="w-[5.5rem] px-1">Interno</span>
      <span className="w-[5.5rem] px-1">Flange</span>
      <span className="w-[3.75rem] px-1">Rech.</span>
      <span className="w-9 text-center">Bitola</span>
      <span className="w-7" />
    </div>
  );
}
