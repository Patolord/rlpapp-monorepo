import { useAuth } from "@clerk/tanstack-react-start";
import { env } from "@rlpapp/env/web";
import { useEffect, useState } from "react";

/** A photo only enters the browser after an explicit request; never persist it. */
export function PunchPhoto({ punchId, employeeName }: { punchId: string; employeeName: string }) {
  const { getToken } = useAuth();
  const [result, setResult] = useState<{ id: string; url?: string; error?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Sessão expirada. Entre novamente para visualizar a foto.");
        const baseUrl = env.VITE_CONVEX_URL.replace(/\.convex\.cloud\/?$/, ".convex.site");
        const url = new URL("/attendance/photo", baseUrl);
        url.searchParams.set("punchId", punchId);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sua sessão não permite acessar esta foto." : "Foto indisponível. Tente novamente mais tarde.");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Foto indisponível.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ id: punchId, url: objectUrl });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ id: punchId, error: error instanceof Error ? error.message : "Foto indisponível." });
      }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [getToken, punchId]);

  if (result?.id !== punchId) return <p role="status" className="p-4 text-sm text-slate-500">Carregando foto…</p>;
  if (result.error) return <p role="alert" className="p-4 text-sm text-amber-800">{result.error}</p>;
  return <img src={result.url} alt={`Foto da marcação de ${employeeName}`} className="max-h-80 w-full rounded-md object-contain" />;
}
