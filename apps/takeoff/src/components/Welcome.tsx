import { Clock, FilePlus2, FileText, FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  hasAutosave,
  openProjectFile,
  pickAndOpenPdf,
  pickAndOpenProject,
  restoreAutosave,
} from "../lib/files";
import { MOD } from "../lib/platform";
import { basename, useDoc } from "../lib/session";
import { UNTITLED } from "../lib/types";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

/** Shown instead of the viewer while the project has no drawing in view. */
export function Welcome() {
  const project = useStore((s) => s.project);
  const recent = useStore((s) => s.recentProjects);
  const filePath = useStore((s) => s.filePath);
  const loading = useDoc((s) => s.loading);
  const error = useDoc((s) => s.error);
  const { setNewProjectOpen } = useStore.getState();
  const [canRestore, setCanRestore] = useState(false);
  useEffect(() => {
    void hasAutosave().then(setCanRestore);
  }, []);
  const hasProject =
    project.name !== UNTITLED ||
    project.drawings.length > 0 ||
    project.items.length > 0 ||
    filePath !== null;

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-neutral-800 p-6">
      <div className="w-full max-w-2xl rounded-xl border border-neutral-700 bg-neutral-900 p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/logo-rlp.png" alt="RLP Engenharia" className="h-9 w-auto" draggable={false} />
          <div>
            <h1 className="text-lg font-semibold text-neutral-100">
              {hasProject ? project.name : "RLP Takeoff"}
            </h1>
            <p className="text-xs text-neutral-400">
              {hasProject
                ? "Takeoff aberto sem planta em exibição. Adicione uma planta (PDF) para começar a marcar."
                : "Um takeoff reúne as plantas (PDF) de uma obra, as marcações, os locais e os itens de todas as disciplinas."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {hasProject ? (
            <Action
              icon={<FileText size={20} />}
              title="Adicionar planta"
              hint={
                <>
                  <Kbd>{MOD}</Kbd>+<Kbd>O</Kbd> ou arraste o arquivo para cá
                </>
              }
              onClick={() => void pickAndOpenPdf()}
              primary
            />
          ) : (
            <Action
              icon={<FilePlus2 size={20} />}
              title="Novo takeoff"
              hint={
                <>
                  <Kbd>{MOD}</Kbd>+<Kbd>N</Kbd> · obra, cliente, disciplinas
                </>
              }
              onClick={() => setNewProjectOpen(true)}
              primary
            />
          )}
          <Action
            icon={<FolderOpen size={20} />}
            title="Abrir takeoff"
            hint="arquivo .takeoff.json"
            onClick={() => void pickAndOpenProject()}
          />
          {hasProject ? (
            <Action
              icon={<FilePlus2 size={20} />}
              title="Novo takeoff"
              hint="começa outra obra"
              onClick={() => setNewProjectOpen(true)}
            />
          ) : (
            <Action
              icon={<FileText size={20} />}
              title="Abrir uma planta direto"
              hint="cria um takeoff com o nome do arquivo"
              onClick={() => void pickAndOpenPdf()}
            />
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-6">
            <div className="mb-1 flex items-center gap-1 text-[12px] uppercase tracking-wide text-neutral-500">
              <Clock size={14} /> Recentes
            </div>
            <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
              {recent.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    onClick={() => void openProjectFile(r.path)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-800"
                    title={r.path}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                      {r.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-neutral-500">
                      {basename(r.path)}
                    </span>
                    <span className="shrink-0 text-[12px] text-neutral-500">
                      {new Date(r.openedAt).toLocaleDateString("pt-BR")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && <p className="mt-4 text-xs text-neutral-400">Carregando PDF…</p>}
        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        {canRestore && !hasProject && (
          <button
            type="button"
            onClick={() => void restoreAutosave().catch(() => setCanRestore(false))}
            className="mt-4 flex items-center gap-1 text-xs text-orange-300 hover:underline"
          >
            <RotateCcw size={14} /> Restaurar a última sessão não salva
          </button>
        )}
      </div>
    </div>
  );
}

function Action({
  icon,
  title,
  hint,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  hint: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <Button
      variant={primary ? "primary" : "ghost"}
      onClick={onClick}
      className="h-auto flex-col items-start gap-1 px-3 py-3 text-left"
    >
      <span className="flex items-center gap-2 text-sm">
        {icon} {title}
      </span>
      <span className={primary ? "text-[12px] opacity-80" : "text-[12px] text-neutral-500"}>
        {hint}
      </span>
    </Button>
  );
}
