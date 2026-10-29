import clsx from "clsx";
import {
  CircleDot,
  GitFork,
  Hand,
  Layers,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  Square,
  SquareDashed,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { mod } from "../lib/platform";
import { type Tool, useStore } from "../store";
import { DuctIcon } from "./icons";
import { IconButton } from "./ui";

interface ToolDef {
  tool: Tool;
  label: string;
  key: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

/** Moving around the drawing. */
const NAVIGATION: ToolDef[] = [
  { tool: "select", label: "Selecionar", key: "V", icon: MousePointer2 },
  { tool: "pan", label: "Mover a vista", key: "H / Espaço", icon: Hand },
];

/** The everyday take-off tools. */
const TAKEOFF: ToolDef[] = [
  { tool: "count", label: "Contagem", key: "C", icon: CircleDot },
  { tool: "linear", label: "Medir (linear)", key: "L", icon: Ruler },
  {
    tool: "kit",
    label: "Kit (um trecho mede vários itens de uma vez: cobre, isolamento, cabo…)",
    key: "T",
    icon: Layers,
  },
  {
    tool: "duct",
    label: "Duto (mede o trecho e pede a seção: chapa, isolamento e flanges são calculados)",
    key: "D",
    icon: DuctIcon,
  },
  {
    tool: "vrf",
    label:
      "VRF (mede o trecho de linha frigorígena e pede tipo e capacidade: bitolas, Y-kits e materiais são calculados)",
    key: "Y",
    icon: GitFork,
  },
];

/** Areas and regions: used now and then, so they share one slot that opens a menu. */
const AREAS: ToolDef[] = [
  { tool: "area", label: "Área por polígono", key: "A", icon: Pentagon },
  { tool: "rect", label: "Área por retângulo", key: "R", icon: Square },
  {
    tool: "magic",
    label: "Área automática (clique dentro do ambiente)",
    key: "M",
    icon: WandSparkles,
  },
  { tool: "zone", label: "Local (delimitar e nomear uma região)", key: "Z", icon: SquareDashed },
];

const Divider = () => <div className="my-1 h-px w-7 bg-neutral-700" />;

export function ToolRail() {
  const tool = useStore((s) => s.tool);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setTool, undo, redo } = useStore.getState();

  const button = ({ tool: t, label, key, icon: Icon }: ToolDef) => (
    <IconButton key={t} label={label} hint={key} active={tool === t} onClick={() => setTool(t)}>
      <Icon size={20} />
    </IconButton>
  );

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-2">
      {NAVIGATION.map(button)}
      <Divider />
      {TAKEOFF.map(button)}
      <AreaTools tool={tool} setTool={setTool} />
      <Divider />
      <IconButton label="Desfazer" hint={mod("Z")} disabled={!canUndo} onClick={undo}>
        <Undo2 size={20} />
      </IconButton>
      <IconButton label="Refazer" hint={mod("Y")} disabled={!canRedo} onClick={redo}>
        <Redo2 size={20} />
      </IconButton>
    </div>
  );
}

/**
 * One rail slot for the area and region tools: it shows the area tool in use (or the polygon
 * when none is) and opens a menu with all of them. Their hotkeys still pick them directly.
 */
function AreaTools({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = AREAS.find((a) => a.tool === tool);
  const Shown = (current ?? AREAS[0]).icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={current ? current.label : "Áreas e locais"}
        hint={current ? current.key : "A, R, M, Z"}
        active={!!current}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative"
      >
        <Shown size={20} />
        {/* corner mark: this slot opens a menu */}
        <span className="absolute right-1 bottom-1 h-0 w-0 border-b-[5px] border-l-[5px] border-b-current border-l-transparent opacity-60" />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute top-0 left-full z-30 ml-2 w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-1 text-xs shadow-xl"
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Áreas e locais
          </div>
          {AREAS.map(({ tool: t, label, key, icon: Icon }) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={tool === t}
              onClick={() => {
                setTool(t);
                setOpen(false);
              }}
              className={clsx(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
                tool === t
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-neutral-200 hover:bg-neutral-700 hover:text-neutral-100",
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">{label}</span>
              <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 font-mono text-[10px] text-neutral-400">
                {key}
              </kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
