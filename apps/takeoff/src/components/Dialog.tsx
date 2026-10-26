import clsx from "clsx";
import { X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { Backdrop } from "./ui";

interface DialogProps {
  title: ReactNode;
  /** Closes the dialog: the × button and Esc. Omit for a dialog that has to be answered. */
  onClose?: () => void;
  /** Extra controls in the title bar, between the title and the × button. */
  headerExtra?: ReactNode;
  /** Makes the body a form: Enter submits, the default is already prevented. */
  onSubmit?: () => void;
  /** Size of the panel (width, height, max height). */
  className?: string;
  /** Layout of the body. Default: padded, scrolls vertically. */
  bodyClassName?: string;
  children: ReactNode;
}

interface Drag {
  pointerX: number;
  pointerY: number;
  fromX: number;
  fromY: number;
  /** Offsets that keep the whole panel inside the backdrop. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * A floating panel over the viewer: dragged by its title bar, closed only by its own controls or
 * Esc. Nothing is dimmed or blocked behind it, so the drawing can still be panned, zoomed and read
 * while the dialog is open, and a half-filled form is never lost by a click outside.
 */
export function Dialog({
  title,
  onClose,
  headerExtra,
  onSubmit,
  className,
  bodyClassName,
  children,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    const el = panel.current;
    const bounds = el?.parentElement;
    if (!el || !bounds) return;
    const r = el.getBoundingClientRect();
    const b = bounds.getBoundingClientRect();
    // r already carries the current offset; the limits are offsets that keep r inside b
    drag.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      fromX: offset.x,
      fromY: offset.y,
      minX: offset.x + (b.left - r.left),
      maxX: offset.x + (b.right - r.right),
      minY: offset.y + (b.top - r.top),
      maxY: offset.y + (b.bottom - r.bottom),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setOffset({
      x: clamp(d.fromX + e.clientX - d.pointerX, d.minX, d.maxX),
      y: clamp(d.fromY + e.clientY - d.pointerY, d.minY, d.maxY),
    });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
    }
  };

  const body = clsx("min-h-0 flex-1", bodyClassName ?? "overflow-y-auto p-5");
  return (
    <Backdrop>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={
          offset.x || offset.y
            ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
            : undefined
        }
        className={clsx(
          "pointer-events-auto flex max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl ring-1 ring-black/40",
          className,
        )}
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          title="Arraste para mover · duplo clique recentra"
          className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-neutral-800 px-4 py-2.5 active:cursor-grabbing"
        >
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
            {title}
          </div>
          {headerExtra}
          {onClose && (
            <button
              type="button"
              aria-label="Fechar"
              title="Fechar (Esc)"
              onClick={onClose}
              className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {onSubmit ? (
          <form
            className={body}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {children}
          </form>
        ) : (
          <div className={body}>{children}</div>
        )}
      </div>
    </Backdrop>
  );
}
