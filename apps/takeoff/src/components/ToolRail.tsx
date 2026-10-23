import {
  AirVent,
  CircleDot,
  GitFork,
  Grid3x3,
  Hand,
  Layers,
  Magnet,
  Maximize,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  ScanSearch,
  Square,
  SquareDashed,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { mod } from "../lib/platform";
import { type Tool, useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { IconButton } from "./ui";

const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Hand }[] = [
  { tool: "select", label: "Selecionar", key: "V", icon: MousePointer2 },
  { tool: "pan", label: "Mover a vista", key: "H / Espaço", icon: Hand },
  { tool: "count", label: "Contagem", key: "C", icon: CircleDot },
  { tool: "linear", label: "Medir (linear)", key: "L", icon: Ruler },
  { tool: "area", label: "Área por polígono", key: "A", icon: Pentagon },
  { tool: "rect", label: "Área por retângulo", key: "R", icon: Square },
  {
    tool: "magic",
    label: "Área automática (clique dentro do ambiente)",
    key: "M",
    icon: WandSparkles,
  },
  { tool: "zone", label: "Local (delimitar e nomear uma região)", key: "Z", icon: SquareDashed },
  {
    tool: "similar",
    label: "Localizar semelhantes (arraste uma caixa ao redor de um símbolo)",
    key: "X",
    icon: ScanSearch,
  },
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
    icon: AirVent,
  },
  {
    tool: "vrf",
    label:
      "VRF (mede o trecho de linha frigorígena e pede tipo e capacidade: bitolas, Y-kits e materiais são calculados)",
    key: "Y",
    icon: GitFork,
  },
];

export function ToolRail() {
  const tool = useStore((s) => s.tool);
  const snap = useStore((s) => s.snap);
  const ortho = useStore((s) => s.ortho);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setTool, toggleSnap, toggleOrtho, undo, redo } = useStore.getState();

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-2">
      {TOOLS.map(({ tool: t, label, key, icon: Icon }) => (
        <IconButton key={t} label={label} hint={key} active={tool === t} onClick={() => setTool(t)}>
          <Icon size={20} />
        </IconButton>
      ))}
      <div className="my-1 h-px w-7 bg-neutral-700" />
      <IconButton label="Snap no desenho" hint="S" active={snap} onClick={toggleSnap}>
        <Magnet size={20} />
      </IconButton>
      <IconButton
        label="Travar em 45° (orto)"
        hint="O ou segure Shift"
        active={ortho}
        onClick={toggleOrtho}
      >
        <Grid3x3 size={20} />
      </IconButton>
      <IconButton label="Ajustar página" hint="F" onClick={() => viewerApi.current?.fit()}>
        <Maximize size={20} />
      </IconButton>
      <div className="my-1 h-px w-7 bg-neutral-700" />
      <IconButton label="Desfazer" hint={mod("Z")} disabled={!canUndo} onClick={undo}>
        <Undo2 size={20} />
      </IconButton>
      <IconButton label="Refazer" hint={mod("Y")} disabled={!canRedo} onClick={redo}>
        <Redo2 size={20} />
      </IconButton>
    </div>
  );
}
