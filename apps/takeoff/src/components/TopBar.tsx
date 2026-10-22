import { FileSpreadsheet, FileText, FolderOpen, Info, Save } from "lucide-react";
import { exportXlsx, pickAndOpenPdf, pickAndOpenProject, saveProject } from "../lib/files";
import { useStore } from "../store";
import { DrawingSwitcher } from "./DrawingSwitcher";
import { UpdateButton } from "./UpdateButton";
import { Button } from "./ui";

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const setProjectMeta = useStore((s) => s.setProjectMeta);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  return (
    <div className="flex h-11 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3">
      <img src="/logo-rlp.png" alt="RLP Engenharia" className="h-7 w-auto" draggable={false} />
      <span className="mr-2 whitespace-nowrap text-sm font-semibold tracking-tight text-orange-400">
        RLP Takeoff
      </span>
      <input
        value={name}
        onChange={(e) => setProjectMeta({ name: e.target.value })}
        className="h-8 w-64 rounded bg-transparent px-2 text-sm text-neutral-100 ring-1 ring-transparent hover:ring-neutral-700 focus:ring-orange-400 outline-none"
        title="Nome do projeto"
      />
      {dirty && <span className="text-xs text-amber-400">● não salvo</span>}
      <UpdateButton />
      <DrawingSwitcher />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <Button onClick={() => void pickAndOpenPdf()} title="Ctrl+O">
          <FileText size={14} /> Abrir PDF
        </Button>
        <Button onClick={() => void pickAndOpenProject()}>
          <FolderOpen size={14} /> Abrir projeto
        </Button>
        <Button onClick={() => void saveProject(false)} title="Ctrl+S (Ctrl+Shift+S: salvar como)">
          <Save size={14} /> Salvar
        </Button>
        <Button variant="primary" onClick={() => void exportXlsx()} title="Ctrl+E">
          <FileSpreadsheet size={14} /> Planilha .xlsx
        </Button>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          title="Sobre o RLP Takeoff (F1): versão e atualizações"
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <Info size={16} />
        </button>
      </div>
    </div>
  );
}
