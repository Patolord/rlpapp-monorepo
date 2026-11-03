import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogIn,
  RefreshCw,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WEB_URL } from "../lib/account/config";
import {
  fetchPublishOptionsAsUser,
  type PublishOptions,
  publishBudgetAsUser,
} from "../lib/account/convex";
import {
  budgetProblem,
  defaultObraId,
  KEPT_REASON,
  loadPublishOptions,
  type Outcome,
  type PublishClient,
  type PublishError,
  resultCounts,
  type SentBudget,
  sendApprovedBudget,
} from "../lib/account/publish";
import { canSignIn, isSignedIn, SignedOutError } from "../lib/account/session";
import {
  budgetSummary,
  centsLabel,
  newProjectUid,
  obraBudgetUrl,
  obrasUrl,
  sentToAppLabel,
} from "../lib/appLink";
import { saveProject } from "../lib/files";
import { isTauri } from "../lib/platform";
import { buildPublishBudget } from "../lib/publishBudget";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

const client: PublishClient = {
  options: fetchPublishOptionsAsUser,
  publish: publishBudgetAsUser,
};

/** Open a dashboard page: the system browser inside the app, a new tab in the browser. */
function openExternal(url: string): void {
  if (isTauri()) void openUrl(url);
  else window.open(url, "_blank", "noopener");
}

const input =
  "h-8 w-full rounded bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/**
 * "Enviar orçamento aprovado": once the client approves the proposal, its budget goes to the
 * company app, where purchasing works on it. An explicit, occasional action (never automatic):
 * choose the obra, confirm the approval, send; sending again updates the same budget there.
 */
export function SendBudgetDialog() {
  const open = useStore((s) => s.sendBudgetOpen);
  // mounted only while open: every opening starts from a fresh state
  return open ? <SendBudgetPanel /> : null;
}

function SendBudgetPanel() {
  const account = useStore((s) => s.account);
  const project = useStore((s) => s.project);
  const filePath = useStore((s) => s.filePath);
  const { setSendBudgetOpen, signIn, setIdentity, setStatus, handleSignedOut } =
    useStore.getState();
  const signedIn = account.status === "signedIn";
  const close = () => setSendBudgetOpen(false);

  const [options, setOptions] = useState<Outcome<PublishOptions> | null>(null);
  const [reload, setReload] = useState(0);
  const [obraId, setObraId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<PublishError | null>(null);
  const [sent, setSent] = useState<SentBudget | null>(null);
  /** The budget reached the app but the file with its link was not saved (why, or ""). */
  const [unsaved, setUnsaved] = useState<string | null>(null);
  /** The takeoff the result belongs to: "Salvar" only saves it while it is still the open one. */
  const [sentFor, setSentFor] = useState<{ id?: string; path: string | null } | null>(null);

  // the obras and the previous send, once signed in (again after "Recarregar", and when the
  // takeoff becomes another budget, e.g. "Salvar como" with the dialog open: what was loaded
  // described the old one)
  const projectId = project.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` and `projectId` re-run the load on purpose
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    setOptions(null);
    setObraId(null);
    setConfirmed(false);
    const current = useStore.getState().project;
    void loadPublishOptions(client, isSignedIn(), current.id).then(async (out) => {
      if (!live) return;
      setOptions(out);
      if (out.ok) setObraId((id) => id ?? defaultObraId(current, out.value));
      else if (out.error.revoked) await handleSignedOut(new SignedOutError(out.error.message));
    });
    return () => {
      live = false;
    };
  }, [signedIn, reload, projectId]);

  const preview = useMemo(() => {
    const problem = budgetProblem(project);
    if (problem) return { problem, summary: null };
    const args = buildPublishBudget(project, { externalId: project.id ?? "novo" });
    return { problem: null, summary: budgetSummary(args) };
  }, [project]);

  const previous = project.sentToApp;
  const serverCurrent = options?.ok ? options.value.current : null;
  const linkedObraId = previous?.obraId ?? serverCurrent?.projectId ?? null;
  const linkedObraName = previous?.obraName ?? serverCurrent?.projectName ?? null;
  const resend = linkedObraId !== null || serverCurrent !== null;

  const send = async () => {
    if (!options?.ok) return;
    const obra = options.value.projects.find((p) => p._id === obraId);
    if (!obra) return;
    setSending(true);
    setSendError(null);
    // the id goes into the file with the link, so the next send updates the same budget
    if (!useStore.getState().project.id) setIdentity({ id: newProjectUid() });
    const sentProject = useStore.getState().project;
    const sendingPath = useStore.getState().filePath;
    const out = await sendApprovedBudget({
      client,
      signedIn: isSignedIn(),
      project: sentProject,
      obra,
      userName: account.user?.name,
    });
    setSending(false);
    if (!out.ok) {
      setSendError(out.error);
      if (out.error.revoked) await handleSignedOut(new SignedOutError(out.error.message));
      return;
    }
    const verb = out.value.result.created ? "enviado ao app" : "atualizado no app";
    // the dialog may have been closed and another takeoff opened while the send was running:
    // the link belongs to the takeoff that was sent, never to whatever is open now
    const now = useStore.getState();
    if (now.project.id !== sentProject.id || now.filePath !== sendingPath) {
      setStatus(
        `Orçamento aprovado ${verb} (obra ${obra.name}) · o takeoff enviado não está mais aberto: ` +
          "abra-o e envie de novo para gravar o vínculo no arquivo",
      );
      return;
    }
    setIdentity({ sentToApp: out.value.sentToApp });
    setSentFor({ id: sentProject.id, path: sendingPath });
    setSent(out.value);
    let saveError: string | null = null;
    let saved = false;
    try {
      saved = now.filePath ? await saveProject(false) : false;
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    }
    setUnsaved(saved ? null : (saveError ?? ""));
    setStatus(
      `Orçamento aprovado ${verb} (obra ${obra.name})${
        saved
          ? ""
          : saveError
            ? ` · não foi possível salvar o arquivo (${saveError}): salve o takeoff (Ctrl+S) para guardar o vínculo`
            : " · salve o takeoff para guardar o vínculo no arquivo"
      }`,
    );
  };

  const body = (() => {
    if (sent) {
      return (
        <SentResult
          sent={sent}
          unsaved={unsaved}
          onSave={async () => {
            const now = useStore.getState();
            if (now.project.id !== sentFor?.id || now.filePath !== sentFor?.path) {
              setUnsaved(
                "o takeoff enviado não está mais aberto: abra-o e envie de novo para gravar o vínculo",
              );
              return;
            }
            try {
              if (await saveProject(false)) setUnsaved(null);
            } catch (e) {
              setUnsaved(e instanceof Error ? e.message : String(e));
            }
          }}
          onClose={close}
        />
      );
    }

    if (!signedIn) {
      return (
        <Notice>
          <p>
            O orçamento vai para o app em nome de quem envia: entre com a conta da empresa (
            {new URL(WEB_URL).host}) para continuar.
          </p>
          {account.status === "signingIn" ? (
            <p className="flex items-center gap-1.5 text-neutral-400">
              <Loader2 size={14} className="animate-spin text-orange-400" /> Confirme no navegador
              que abriu…
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                disabled={!canSignIn()}
                onClick={() => void signIn()}
                title={canSignIn() ? undefined : "O login só funciona no app instalado"}
              >
                <LogIn size={14} /> Entrar
              </Button>
              {!canSignIn() && (
                <span className="text-neutral-500">O login só funciona no app instalado.</span>
              )}
              {account.error && <span className="text-red-400">{account.error}</span>}
            </div>
          )}
        </Notice>
      );
    }

    if (!filePath) {
      return (
        <Notice>
          <p>
            Salve o takeoff em arquivo antes de enviar: o vínculo com o orçamento no app fica
            gravado no arquivo, e um novo envio (uma revisão) atualiza o mesmo orçamento.
          </p>
          <div>
            <Button variant="primary" onClick={() => void saveProject(true)}>
              <Save size={14} /> Salvar em arquivo…
            </Button>
          </div>
        </Notice>
      );
    }

    if (preview.problem) return <ErrorBox error={preview.problem} />;

    if (!options) {
      return (
        <p className="flex items-center gap-2 text-neutral-400">
          <Loader2 size={14} className="animate-spin text-orange-400" /> Buscando as obras no app…
        </p>
      );
    }

    if (!options.ok) {
      return (
        <div className="space-y-2">
          <ErrorBox error={options.error} />
          {options.error.code !== "FORBIDDEN" && (
            <Button onClick={() => setReload((n) => n + 1)}>
              <RefreshCw size={14} /> Tentar de novo
            </Button>
          )}
        </div>
      );
    }

    const obras = options.value.projects;
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    const shown = q
      ? obras.filter(
          (o) =>
            o.name.toLocaleLowerCase("pt-BR").includes(q) ||
            (o.legacyNumber !== null && String(o.legacyNumber).includes(q)),
        )
      : obras;
    const chosen = obras.find((o) => o._id === obraId) ?? null;
    const moving = chosen !== null && linkedObraId !== null && chosen._id !== linkedObraId;
    const summary = preview.summary;
    return (
      <div className="space-y-3">
        {resend && (
          <p className="rounded bg-sky-500/10 px-2 py-1.5 text-sky-200">
            {previous
              ? sentToAppLabel(previous)
              : `Este takeoff já está no app${linkedObraName ? ` (obra ${linkedObraName})` : ""}`}
            . Enviar de novo <strong>atualiza o orçamento aprovado</strong> que já está lá (por
            exemplo, uma revisão); as linhas em que a Compras já trabalhou são mantidas.
          </p>
        )}

        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Obra no app
          </h3>
          {obras.length === 0 ? (
            <p className="text-neutral-400">Nenhuma obra cadastrada no app.</p>
          ) : (
            <>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por nome ou número da obra"
                className={input}
              />
              <div className="max-h-44 overflow-y-auto rounded ring-1 ring-neutral-800">
                {shown.map((o) => (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => setObraId(o._id)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-neutral-800 ${
                      o._id === obraId ? "bg-orange-500/15 text-orange-200" : "text-neutral-200"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {o._id === linkedObraId && (
                      <span className="text-[10px] text-sky-300">enviado aqui</span>
                    )}
                    {o.archived && <span className="text-[10px] text-neutral-500">arquivada</span>}
                    {o.legacyNumber !== null && (
                      <span className="font-mono text-[11px] text-neutral-500">
                        nº {o.legacyNumber}
                      </span>
                    )}
                  </button>
                ))}
                {shown.length === 0 && (
                  <p className="px-2 py-1.5 text-neutral-500">Nenhuma obra com “{filter}”.</p>
                )}
              </div>
            </>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
            A obra ainda não existe? Crie-a no app (Engenharia › Obras) e recarregue a lista.
            <button
              type="button"
              onClick={() => openExternal(obrasUrl(WEB_URL))}
              className="inline-flex items-center gap-1 text-orange-300 hover:underline"
            >
              Abrir obras no app <ExternalLink size={11} />
            </button>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="inline-flex items-center gap-1 text-orange-300 hover:underline"
            >
              <RefreshCw size={11} /> Recarregar
            </button>
          </p>
          {moving && (
            <p className="flex items-start gap-1.5 text-amber-300">
              <TriangleAlert size={14} className="mt-px shrink-0" />O orçamento está na obra{" "}
              {linkedObraName ?? "anterior"}: enviar para {chosen.name} o move (com as linhas e
              cotações) para esta obra.
            </p>
          )}
        </section>

        {summary && (
          <section className="space-y-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Proposta aprovada
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-neutral-800/60 px-2 py-1.5">
              <dt className="text-neutral-500">Proposta nº</dt>
              <dd className="text-neutral-100">{project.proposalNumber.trim() || "—"}</dd>
              <dt className="text-neutral-500">Cliente</dt>
              <dd className="text-neutral-100">{project.client.trim() || "—"}</dd>
              {project.site.trim() && (
                <>
                  <dt className="text-neutral-500">Local</dt>
                  <dd className="text-neutral-100">{project.site.trim()}</dd>
                </>
              )}
              <dt className="text-neutral-500">Planilha</dt>
              <dd className="text-neutral-100">
                {summary.tabs} {summary.tabs === 1 ? "aba" : "abas"} · {summary.lines}{" "}
                {summary.lines === 1 ? "linha" : "linhas"} · total geral{" "}
                {centsLabel(summary.totalCents)}
              </dd>
              <dt className="text-neutral-500">Valor com BDI</dt>
              <dd className="font-semibold text-orange-300">{centsLabel(summary.proposalCents)}</dd>
            </dl>
            {summary.lines === 0 && (
              <p className="text-amber-300">O orçamento não tem linhas para enviar.</p>
            )}
          </section>
        )}

        <label className="flex items-start gap-2 text-neutral-200">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-orange-500"
          />
          <span>
            Confirmo que o cliente aprovou esta proposta
            {project.proposalNumber.trim() ? ` (nº ${project.proposalNumber.trim()})` : ""}. Só
            orçamentos aprovados vão para o app, onde a Compras trabalha neles.
          </span>
        </label>

        {sendError && <ErrorBox error={sendError} />}
      </div>
    );
  })();

  const canSend =
    !sent &&
    signedIn &&
    !!filePath &&
    options?.ok === true &&
    !preview.problem &&
    (preview.summary?.lines ?? 0) > 0 &&
    obraId !== null &&
    confirmed &&
    !sending;

  return (
    <Dialog
      title={resend ? "Atualizar orçamento aprovado no app" : "Enviar orçamento aprovado ao app"}
      onClose={close}
      className="max-h-[85vh] w-[32rem] text-xs"
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
      {!sent && (
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-4 py-2">
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" disabled={!canSend} onClick={() => void send()}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {resend ? "Atualizar no app" : "Enviar orçamento aprovado"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 text-neutral-300">{children}</div>;
}

function ErrorBox({ error }: { error: PublishError }) {
  return (
    <p className="flex items-start gap-1.5 rounded bg-red-500/10 px-2 py-1.5 text-red-300">
      <TriangleAlert size={14} className="mt-px shrink-0" />
      <span>{error.message}</span>
    </p>
  );
}

function SentResult({
  sent,
  unsaved,
  onSave,
  onClose,
}: {
  sent: SentBudget;
  /** Not null when the link is not in the file yet: the save error, or "" (no file / cancelled). */
  unsaved: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const { result, sentToApp } = sent;
  const url = sentToApp.obraSlug ? obraBudgetUrl(WEB_URL, sentToApp.obraSlug) : null;
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-emerald-300">
        <CheckCircle2 size={16} className="shrink-0" />
        <span>
          {result.created
            ? `Orçamento aprovado enviado à obra ${sentToApp.obraName}.`
            : `Orçamento aprovado atualizado na obra ${sentToApp.obraName}.`}
        </span>
      </p>
      {unsaved !== null && (
        <p className="flex items-center gap-2 text-amber-300">
          <span>
            O orçamento chegou ao app, mas o vínculo ainda não está salvo no arquivo
            {unsaved ? ` (${unsaved})` : ""}: sem ele, um novo envio deste takeoff cria outro
            orçamento.
          </span>
          <Button onClick={onSave}>Salvar</Button>
        </p>
      )}
      <p className="text-neutral-300">Linhas: {resultCounts(result)}.</p>
      {result.kept.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            {result.kept.length === 1
              ? "1 linha mantida pela Compras"
              : `${result.kept.length} linhas mantidas pela Compras`}
          </h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded bg-neutral-800/60 px-2 py-1.5">
            {result.kept.map((k) => (
              <li key={k.itemId}>
                <span className="text-neutral-100">{k.rawDescription}</span>
                <span className="text-neutral-500"> · {KEPT_REASON[k.reason]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.unknownMaterialIds.length > 0 && (
        <p className="text-neutral-400">
          {result.unknownMaterialIds.length === 1
            ? "1 material do catálogo não foi encontrado no app: a linha ficou sem vínculo."
            : `${result.unknownMaterialIds.length} materiais do catálogo não foram encontrados no app: as linhas ficaram sem vínculo.`}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        {url && (
          <Button onClick={() => openExternal(url)}>
            <ExternalLink size={14} /> Abrir no app
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
