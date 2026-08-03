import { useEffect } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

/** Redireciona URLs legadas /engenharia/relatorios/* para /engenharia/obras/*. */
export function RelatoriosRedirect() {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const location = useLocation();
  const navigate = useNavigate();
  const resolved = useQuery(
    api.projects.resolve,
    projectId ? { identifier: projectId } : "skip"
  );

  useEffect(() => {
    if (!projectId) {
      void navigate({ to: "/engenharia/obras", replace: true });
      return;
    }

    if (resolved === undefined) return;

    if (resolved === null) {
      void navigate({ to: "/engenharia/obras", replace: true });
      return;
    }

    const prefix = `/engenharia/relatorios/${projectId}`;
    const suffix = location.pathname.startsWith(prefix)
      ? location.pathname.slice(prefix.length)
      : "";

    void navigate({
      to: `/engenharia/obras/${resolved.slug}${suffix}`,
      replace: true,
    });
  }, [projectId, resolved, location.pathname, navigate]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
