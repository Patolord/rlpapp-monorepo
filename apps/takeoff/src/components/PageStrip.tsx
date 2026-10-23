import clsx from "clsx";
import { useEffect, useState } from "react";
import { session, useDoc } from "../lib/session";
import { useStore } from "../store";

function Thumb({ index }: { index: number }) {
  const docId = useDoc((s) => s.docId);
  const [src, setSrc] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new document needs a new thumbnail
  useEffect(() => {
    let alive = true;
    setSrc(null);
    session.renderer
      ?.renderThumb(index, 150)
      .then((url) => alive && setSrc(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [index, docId]);
  return src ? (
    <img src={src} alt={`Página ${index + 1}`} className="w-full" draggable={false} />
  ) : (
    <div className="aspect-[1.4] w-full animate-pulse bg-neutral-700" />
  );
}

export function PageStrip() {
  const numPages = useDoc((s) => s.numPages);
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  if (numPages < 2) return null;
  return (
    <div className="w-40 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-900 p-2">
      {Array.from({ length: numPages }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setPage(i)}
          className={clsx(
            "mb-2 w-full overflow-hidden rounded border bg-white text-left",
            i === page
              ? "border-orange-400 ring-2 ring-orange-400/40"
              : "border-neutral-700 hover:border-neutral-500",
          )}
        >
          <Thumb index={i} />
          <div className="bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
            Página {i + 1}
          </div>
        </button>
      ))}
    </div>
  );
}
