import clsx from "clsx";
import { FileSpreadsheet, FileText, Save, Send } from "lucide-react";
import { sentToAppLabel } from "../lib/appLink";
import { saveProject } from "../lib/files";
import { mod } from "../lib/platform";
import { basename } from "../lib/session";
import { useStore } from "../store";
import { AccountMenu } from "./AccountMenu";
import { ProjectMenu } from "./ProjectMenu";
import { UpdateButton } from "./UpdateButton";
import { Button } from "./ui";

/**
 * The window's top bar: the takeoff's name with its save state underneath, the actions used on
 * every takeoff (save, cutout report, send to the company app, budget sheet) as buttons, and the
 * rest (new, open, recent, save as, catalog, close) in the "⋯" menu.
 */
export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const setProjectMeta = useStore((s) => s.setProjectMeta);
  const filePath = useStore((s) => s.filePath);
  const sentToApp = useStore((s) => s.project.sentToApp);
  const { setXlsxExportOpen, setReportOpen, setSendBudgetOpen } = useStore.getState();
  const saveState = dirty ? "Alterações não salvas" : filePath ? "Salvo" : "Sem arquivo";
  return (
    <div className="flex h-12 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3">
      <img src="/logo-rlp.png" alt="RLP Engenharia" className="h-7 w-auto" draggable={false} />
      <span className="mr-1 whitespace-nowrap text-sm font-semibold tracking-tight text-orange-400">
        RLP Takeoff
      </span>
      <div className="h-5 w-px shrink-0 bg-neutral-800" />
      <div className="flex min-w-[6rem] max-w-[22rem] shrink flex-col">
        <input
          value={name}
          onChange={(e) => setProjectMeta({ name: e.target.value })}
          aria-label="Nome do takeoff (obra)"
          title="Nome do takeoff (obra)"
          className="-ml-1 h-6 w-full rounded bg-transparent px-1 text-sm font-semibold text-neutral-100 ring-1 ring-transparent outline-none hover:ring-neutral-700 focus:ring-orange-400"
        />
        <span
          className="flex min-w-0 items-center gap-1.5 text-[12px] text-neutral-500"
          title={filePath ?? "Takeoff ainda não salvo em arquivo"}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              dirty ? "bg-amber-500" : filePath ? "bg-emerald-500" : "bg-neutral-600",
            )}
          />
          <span className="truncate">
            {saveState}
            {filePath ? ` · ${basename(filePath)}` : ""}
          </span>
        </span>
      </div>
      <UpdateButton />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <Button onClick={() => void saveProject(false)} title={`Salvar (${mod("S")})`}>
          <Save size={16} /> Salvar
        </Button>
        <div className="mx-0.5 h-5 w-px bg-neutral-800" />
        <Button
          onClick={() => setReportOpen(true)}
          aria-label="Relatório de recortes (PDF)"
          title={`Relatório de recortes em PDF (${mod("Shift+E")})`}
        >
          <FileText size={16} /> <span className="hidden lg:inline">Relatório PDF</span>
        </Button>
        <Button
          onClick={() => setSendBudgetOpen(true)}
          aria-label={sentToApp ? "Atualizar o orçamento no app" : "Enviar o orçamento ao app"}
          title={
            sentToApp
              ? `${sentToAppLabel(sentToApp)}. Clique para atualizar o orçamento aprovado no app`
              : "Enviar o orçamento aprovado ao app da empresa"
          }
        >
          <Send size={16} />{" "}
          <span className="hidden lg:inline">
            {sentToApp ? "Atualizar no app" : "Enviar ao app"}
          </span>
        </Button>
        <Button
          variant="primary"
          onClick={() => setXlsxExportOpen(true)}
          title={`${mod("E")}: exporta a planilha orçamentária (escolha as disciplinas e opções)`}
        >
          <FileSpreadsheet size={16} /> Planilha .xlsx
        </Button>
        <ProjectMenu />
        <AccountMenu />
      </div>
    </div>
  );
}
