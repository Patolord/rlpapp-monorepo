import ReactDOM from "react-dom/client";
import App from "./App";
import { devAutoOpen } from "./lib/session";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

void devAutoOpen().catch((e) => console.error(e));

if (import.meta.env.DEV) {
  // handy for debugging from the devtools console
  void Promise.all([
    import("./store"),
    import("./viewport"),
    import("./lib/session"),
    import("./lib/files"),
  ]).then(([s, v, d, f]) => {
    (window as unknown as Record<string, unknown>).__takeoff = {
      store: s.useStore,
      viewport: v.useViewport,
      doc: d.useDoc,
      session: d.session,
      devAddDrawing: d.devAddDrawing,
      // file dialogs are off in the browser: replace the active drawing by an absolute path
      devReplaceDrawing: (path: string) => {
        const id = s.useStore.getState().project.activeDrawingId;
        return id ? f.replaceDrawingWith(id, path) : undefined;
      },
    };
  });
}
