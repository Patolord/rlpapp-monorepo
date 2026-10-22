import { ChevronDown, FilePlus2, FolderOpen, FolderX, Save, SaveAll } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { closeProject, openProjectFile, pickAndOpenProject, saveProject } from "../lib/files";
import { MOD } from "../lib/platform";
import { basename } from "../lib/session";
import { useStore } from "../store";
import { Kbd } from "./ui";

/** Project menu: new, open, recent, save, save as, close. */
export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recent = useStore((s) => s.recentProjects);
  const filePath = useStore((s) => s.filePath);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
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
        className="inline-flex h-8 items-center gap-1 rounded-md bg-neutral-800 px-2.5 text-xs font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
      >
        Takeoff <ChevronDown size={15} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-40 w-72 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
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
            <Save size={16} />,
            "Salvar",
            () => void saveProject(false),
            <>
              <Kbd>{MOD}</Kbd>+<Kbd>S</Kbd>
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
          {item(<FolderX size={16} />, "Fechar takeoff", () => closeProject())}
        </div>
      )}
    </div>
  );
}
