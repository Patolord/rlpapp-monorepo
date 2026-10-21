import {
  CircleDot,
  Grid3x3,
  Hand,
  Magnet,
  Maximize,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  Spline,
  Square,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { type Tool, useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { IconButton } from "./ui";

const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Hand }[] = [
  { tool: "select", label: "Select", key: "V", icon: MousePointer2 },
  { tool: "pan", label: "Pan", key: "H / Space", icon: Hand },
  { tool: "count", label: "Count", key: "C", icon: CircleDot },
  { tool: "linear", label: "Linear", key: "L", icon: Spline },
  { tool: "area", label: "Area polygon", key: "A", icon: Pentagon },
  { tool: "rect", label: "Area rectangle", key: "R", icon: Square },
  { tool: "magic", label: "Magic area (click inside a room)", key: "M", icon: WandSparkles },
  { tool: "calibrate", label: "Calibrate scale", key: "K", icon: Ruler },
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
          <Icon size={18} />
        </IconButton>
      ))}
      <div className="my-1 h-px w-7 bg-neutral-700" />
      <IconButton label="Snap to drawing" hint="S" active={snap} onClick={toggleSnap}>
        <Magnet size={18} />
      </IconButton>
      <IconButton
        label="Ortho / 45° lock"
        hint="O or hold Shift"
        active={ortho}
        onClick={toggleOrtho}
      >
        <Grid3x3 size={18} />
      </IconButton>
      <IconButton label="Fit page" hint="F" onClick={() => viewerApi.current?.fit()}>
        <Maximize size={18} />
      </IconButton>
      <div className="my-1 h-px w-7 bg-neutral-700" />
      <IconButton label="Undo" hint="Ctrl+Z" disabled={!canUndo} onClick={undo}>
        <Undo2 size={18} />
      </IconButton>
      <IconButton label="Redo" hint="Ctrl+Y" disabled={!canRedo} onClick={redo}>
        <Redo2 size={18} />
      </IconButton>
    </div>
  );
}
