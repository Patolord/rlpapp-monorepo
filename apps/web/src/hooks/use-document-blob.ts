import { useCallback } from "react";
import { useAuth } from "@clerk/tanstack-react-start";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { env } from "@rlpapp/env/web";

import { fetchDocumentBlob } from "@/lib/project-documents";

/**
 * Função para baixar o PDF de um documento pelo endpoint autenticado, com o
 * JWT da sessão Clerk atual (mesmo template usado pelo cliente Convex).
 */
export function useDocumentBlobFetcher(): (
  documentId: Id<"projectDocuments">
) => Promise<Blob> {
  const { getToken } = useAuth();
  return useCallback(
    (documentId: Id<"projectDocuments">) =>
      fetchDocumentBlob(env.VITE_CONVEX_URL, documentId, () =>
        getToken({ template: "convex" })
      ),
    [getToken]
  );
}
