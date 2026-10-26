import { FileSpreadsheet, FileText, Info } from "lucide-react";
import { exportXlsx, pickAndOpenPdf } from "../lib/files";
import { mod } from "../lib/platform";
import { basename } from "../lib/session";
import { useStore } from "../store";
import { ProjectMenu } from "./ProjectMenu";
import { UpdateButton } from "./UpdateButton";
import { Button } from "./ui";

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const setProjectMeta = useStore((s) => s.setProjectMeta);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const filePath = useStore((s) => s.filePath);
  return (
    <div className="flex h-11 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3">
      <img src="/logo-rlp.png" alt="RLP Engenharia" className="h-7 w-auto" draggable={false} />
      <span className="mr-2 whitespace-nowrap text-sm font-semibold tracking-tight text-orange-400">
        RLP Takeoff
      </span>
      <input
        value={name}
        onChange={(e) => setProjectMeta({ name: e.target.value })}
        className="h-8 w-64 min-w-[6rem] shrink rounded bg-transparent px-2 text-sm text-neutral-100 ring-1 ring-transparent hover:ring-neutral-700 focus:ring-orange-400 outline-none"
        title="Nome do takeoff (obra)"
      />
      <span
        className="hidden max-w-[11rem] shrink-0 truncate text-[12px] text-neutral-500 xl:inline"
        title={filePath ?? "Takeoff ainda não salvo em arquivo"}
      >
        {filePath ? basename(filePath) : "sem arquivo"}
      </span>
      {dirty && <span className="shrink-0 text-xs text-amber-400">● não salvo</span>}
      <UpdateButton />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <ProjectMenu />
        <Button
          onClick={() => void pickAndOpenPdf()}
          title={`${mod("O")}: adiciona uma planta (PDF) ao takeoff`}
        >
          <FileText size={16} /> Adicionar plantas
        </Button>
        <Button variant="primary" onClick={() => void exportXlsx()} title={mod("E")}>
          <FileSpreadsheet size={16} /> Planilha .xlsx
        </Button>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          title="Sobre o RLP Takeoff (F1): versão e atualizações"
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <Info size={18} />
        </button>
      </div>
    </div>
  );
}
