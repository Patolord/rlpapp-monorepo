import {
  Ellipsis,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderX,
  Info,
  SaveAll,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  closeProject,
  openProjectFile,
  pickAndOpenPdf,
  pickAndOpenProject,
  saveProject,
} from "../lib/files";
import { MOD } from "../lib/platform";
import { basename } from "../lib/session";
import { useStore } from "../store";
import { Kbd } from "./ui";

/**
 * The "⋯" menu of the top bar: what is used now and then (new, open, recent, add drawings, save
 * as, catalog and prices, about, close). Save, the cutout report, sending to the company app and
 * the budget sheet are buttons of their own on the bar.
 */
export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recent = useStore((s) => s.recentProjects);
  const filePath = useStore((s) => s.filePath);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  const setCatalogSettingsOpen = useStore((s) => s.setCatalogSettingsOpen);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
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

  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    shortcut?: React.ReactNode,
    disabled = false,
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-neutral-500">{shortcut}</span>}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Mais ações do takeoff"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mais ações: novo, abrir, recentes, salvar como, catálogo…"
        className={
          open
            ? "flex h-8 w-8 items-center justify-center rounded-md bg-neutral-700 text-neutral-100 ring-1 ring-neutral-700"
            : "flex h-8 w-8 items-center justify-center rounded-md bg-neutral-800 text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
        }
      >
        <Ellipsis size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="enter-pop absolute top-9 right-0 z-40 w-72 origin-top-right rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
        >
          {item(
            <FilePlus2 size={16} />,
            "Novo takeoff…",
            () => setNewProjectOpen(true),
            <>
              <Kbd>{MOD}</Kbd>+<Kbd>N</Kbd>
            </>,
          )}
          {item(<FolderOpen size={16} />, "Abrir takeoff…", () => void pickAndOpenProject())}
          {recent.length > 0 && (
            <div className="my-1 border-y border-neutral-800 py-1">
              <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                Recentes
              </div>
              {recent.slice(0, 6).map((r) => (
                <button
                  key={r.path}
                  type="button"
                  role="menuitem"
                  title={r.path}
                  onClick={() => {
                    setOpen(false);
                    void openProjectFile(r.path);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-neutral-800"
                >
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{r.name}</span>
                  <span className="max-w-[8rem] truncate font-mono text-[11px] text-neutral-500">
                    {basename(r.path)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {item(
            <FileText size={16} />,
            "Adicionar plantas…",
            () => void pickAndOpenPdf(),
            <>
              <Kbd>{MOD}</Kbd>+<Kbd>O</Kbd>
            </>,
          )}
          {item(
            <SaveAll size={16} />,
            filePath ? "Salvar como…" : "Salvar em arquivo…",
            () => void saveProject(true),
            <>
              <Kbd>{MOD}</Kbd>+<Kbd>Shift</Kbd>+<Kbd>S</Kbd>
            </>,
          )}
          <div className="my-1 border-t border-neutral-800" />
          {item(<Settings2 size={16} />, "Catálogo e preços…", () => setCatalogSettingsOpen(true))}
          {item(<Info size={16} />, "Sobre o RLP Takeoff", () => setAboutOpen(true), <Kbd>F1</Kbd>)}
          <div className="my-1 border-t border-neutral-800" />
          {item(<FolderX size={16} />, "Fechar takeoff", () => void closeProject())}
        </div>
      )}
    </div>
  );
}
