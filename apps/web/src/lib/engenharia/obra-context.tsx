import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { OBRAS_LIST_PATH } from "@/lib/engenharia/obra-paths";

const ObraProjectIdContext = createContext<Id<"projects"> | null>(null);

export function useObraProjectId(): Id<"projects"> {
  const projectId = useContext(ObraProjectIdContext);
  if (!projectId) {
    throw new Error("useObraProjectId must be used within ObraSlugLayout");
  }
  return projectId;
}

export function ObraSlugLayout({
  obraSlug,
  children,
}: {
  obraSlug: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useQuery(api.projects.resolve, { identifier: obraSlug });

  useEffect(() => {
    if (!resolved || resolved.slug === obraSlug) return;

    const from = `/engenharia/obras/${obraSlug}`;
    const to = `/engenharia/obras/${resolved.slug}`;
    if (!location.pathname.startsWith(from)) return;

    const newPath = location.pathname.replace(from, to);
    void navigate({ to: newPath, replace: true });
  }, [resolved, obraSlug, location.pathname, navigate]);

  if (resolved === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (resolved === null) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <Building2 className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Obra não encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          Esta obra pode ter sido removida ou o endereço está incorreto.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          render={<Link to={OBRAS_LIST_PATH} />}
        >
          <ArrowLeft className="mr-2 size-4" />
          Voltar para obras
        </Button>
      </div>
    );
  }

  return (
    <ObraProjectIdContext.Provider value={resolved._id}>
      {children}
    </ObraProjectIdContext.Provider>
  );
}
