/**
 * Rendering while the window is not on screen. pdf.js paces a page render with
 * requestAnimationFrame, and a browser stops delivering frames to a window that is minimised or
 * covered. That is exactly when the agent works (the user is looking at the assistant, not at
 * the takeoff), so a render started for the agent would wait for a frame that never comes.
 * While such a render runs, frames are replaced by message-channel ticks, which keep flowing in
 * the background; the page is rendered exactly as the viewer renders it, only not in step with
 * the display. The viewer's own repaints during that time run on the same ticks, harmlessly.
 */

let depth = 0;
let native: {
  request: typeof window.requestAnimationFrame;
  cancel: typeof window.cancelAnimationFrame;
} | null = null;
let channel: MessageChannel | null = null;

const queue = new Map<number, FrameRequestCallback>();
// ticks get negative ids, so a cancel can tell them from the browser's own frame ids
let nextId = -1;

function tick() {
  const due = [...queue.values()];
  queue.clear();
  const now = performance.now();
  for (const callback of due) callback(now);
}

function requestTick(callback: FrameRequestCallback): number {
  const id = nextId--;
  queue.set(id, callback);
  channel?.port2.postMessage(0);
  return id;
}

/** Cancels a tick or a real frame; stays installed, as a tick may be cancelled after the render. */
function cancelEither(id: number): void {
  if (id < 0) queue.delete(id);
  else native?.cancel(id);
}

function install() {
  native ??= {
    request: window.requestAnimationFrame.bind(window),
    cancel: window.cancelAnimationFrame.bind(window),
  };
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = tick;
  }
  window.requestAnimationFrame = requestTick;
  window.cancelAnimationFrame = cancelEither;
}

/** Run a page render that must finish even when the window is hidden. */
export async function renderInBackground<T>(render: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined" || typeof MessageChannel === "undefined") return render();
  if (depth++ === 0) install();
  try {
    return await render();
  } finally {
    if (--depth === 0 && native) window.requestAnimationFrame = native.request;
  }
}
