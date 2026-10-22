import ReactDOM from "react-dom/client";
import App from "./App";
import { devAutoOpen } from "./lib/session";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

void devAutoOpen().catch((e) => console.error(e));

if (import.meta.env.DEV) {
  // handy for debugging from the devtools console
  void Promise.all([import("./store"), import("./viewport"), import("./lib/session")]).then(
    ([s, v, d]) => {
      (window as unknown as Record<string, unknown>).__takeoff = {
        store: s.useStore,
        viewport: v.useViewport,
        doc: d.useDoc,
        session: d.session,
        devAddDrawing: d.devAddDrawing,
      };
    },
  );
}
