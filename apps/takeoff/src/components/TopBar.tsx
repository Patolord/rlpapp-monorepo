import { FileSpreadsheet, FileText, FolderOpen, Save } from "lucide-react";
import { exportXlsx, pickAndOpenPdf, pickAndOpenProject, saveProject } from "../lib/files";
import { useDoc } from "../lib/session";
import { useStore } from "../store";
import { Button } from "./ui";

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const pdfName = useDoc((s) => s.name);
  const setProjectMeta = useStore((s) => s.setProjectMeta);
  return (
    <div className="flex h-11 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3">
      <span className="mr-2 text-sm font-semibold tracking-tight text-orange-400">Takeoff</span>
      <input
        value={name}
        onChange={(e) => setProjectMeta({ name: e.target.value })}
        className="h-8 w-64 rounded bg-transparent px-2 text-sm text-neutral-100 ring-1 ring-transparent hover:ring-neutral-700 focus:ring-orange-400 outline-none"
        title="Nome do projeto"
      />
      {dirty && <span className="text-xs text-amber-400">● não salvo</span>}
      {pdfName && <span className="truncate text-xs text-neutral-500">{pdfName}</span>}
      <div className="ml-auto flex items-center gap-1.5">
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
      </div>
    </div>
  );
}
