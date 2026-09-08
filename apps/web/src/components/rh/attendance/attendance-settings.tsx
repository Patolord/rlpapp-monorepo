import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Check, Link2, RefreshCw, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { runWithToast } from "@/lib/errors";
import { formatMoney, todayInSaoPaulo } from "./format";
import { selectClass } from "./attendance-dashboard";

export function AttendanceSettings() {
  const settings = useQuery(api.attendance.getSettings, {});
  const configure = useMutation(api.attendance.configure);
  const setDailyRate = useMutation(api.attendance.setDailyRate);
  const requestSync = useMutation(api.attendance.requestSync);
  const requestBackfill = useMutation(api.attendance.requestBackfill);
  const [busy, setBusy] = useState<string | null>(null);
  const [mappingKind, setMappingKind] = useState<"employees" | "geofences">("employees");
  const [companyConfirm, setCompanyConfirm] = useState<{ enabled: boolean; companyId: number; departmentNames: string[] } | null>(null);
  async function perform(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    await runWithToast(action, success, "Não foi possível concluir. Tente novamente.");
    setBusy(null);
  }
  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const fields = new FormData(event.currentTarget);
    const companyId = Number(fields.get("companyId"));
    const departmentNames = String(fields.get("departmentNames") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
    if (!Number.isSafeInteger(companyId) || companyId < 1 || !departmentNames.length) {
      toast.error("Informe uma empresa válida e ao menos um departamento.");
      return;
    }
    const payload = { enabled: fields.get("enabled") === "on", companyId, departmentNames };
    if (companyId !== settings.companyId) {
      setCompanyConfirm(payload);
      return;
    }
    await perform("connection", () => configure(payload), "Configuração salva");
  }
  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = String(new FormData(event.currentTarget).get("dailyRate") ?? "").trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) { toast.error("Informe a diária em reais, com até duas casas decimais."); return; }
    const dailyRateCents = Math.round(Number(input.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(dailyRateCents)) { toast.error("Informe um valor válido."); return; }
    await perform("rate", () => setDailyRate({ dailyRateCents }), "Diária de referência salva");
  }
  if (!settings) return <p role="status" className="p-6 text-sm text-slate-500">Carregando configuração…</p>;
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Vínculos e ajustes</h1><p className="mt-1 text-sm text-slate-600">Associe os registros do RHiD aos funcionários e às obras do ERP.</p></div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div><h2 className="font-semibold">Sincronização com o RHiD</h2><p className="mt-1 text-sm text-slate-600">{settings.credentialsConfigured ? "Acesso ao RHiD configurado." : "O acesso ao RHiD precisa ser configurado pelo administrador."} {settings.enabled ? "Sincronização ativada." : "Sincronização desativada."}</p></div>
        {settings.canConfigureConnection ? <form key={`${settings.companyId}-${settings.departmentNames.join(",")}-${settings.enabled}`} onSubmit={(event) => void saveConnection(event)} className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Código da empresa no RHiD<Input name="companyId" type="number" min="1" step="1" required defaultValue={settings.companyId} /></label>
          <label className="block space-y-1 text-sm font-medium">Departamentos no RHiD<Input name="departmentNames" required defaultValue={settings.departmentNames.join(", ")} /><span className="block text-xs font-normal text-slate-500">Nomes separados por vírgula. Este filtro define as pessoas consideradas na consulta.</span></label>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="size-4 accent-primary" />Ativar sincronização</label>
          <Button type="submit" disabled={busy !== null}><Save />Salvar configuração</Button>
        </form> : <dl className="space-y-2 text-sm"><div><dt className="text-slate-500">Empresa no RHiD</dt><dd>{settings.companyId}</dd></div><div><dt className="text-slate-500">Departamentos</dt><dd>{settings.departmentNames.join(", ")}</dd></div><p className="text-xs text-slate-500">O administrador pode alterar o acesso e o escopo da sincronização.</p></dl>}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4"><Button variant="outline" disabled={busy !== null || !settings.enabled || !settings.credentialsConfigured} onClick={() => void perform("sync", () => requestSync({ date: todayInSaoPaulo() }), "Sincronização de hoje solicitada")}><RefreshCw className={busy === "sync" ? "animate-spin" : ""} />Atualizar hoje</Button><Button variant="outline" disabled={busy !== null || !settings.enabled || !settings.credentialsConfigured} onClick={() => void perform("backfill", () => requestBackfill({ days: 90 }), "Importação dos últimos 90 dias solicitada. Acompanhe a cobertura nos relatórios.")}>Importar últimos 90 dias</Button></div>
      </section>
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"><div><h2 className="font-semibold">Diária de referência</h2><p className="mt-1 text-sm text-slate-600">Usada nas estimativas dos relatórios de ponto. A alteração recalcula a estimativa de todo o período consultado; não altera a folha de pagamento.</p></div><p className="text-2xl font-semibold tabular-nums">{formatMoney(settings.dailyRateCents)}</p><form key={settings.dailyRateCents} onSubmit={(event) => void saveRate(event)} className="space-y-3"><label className="block space-y-1 text-sm font-medium">Valor em reais<Input name="dailyRate" inputMode="decimal" required defaultValue={(settings.dailyRateCents / 100).toFixed(2).replace(".", ",")} /></label><Button type="submit" disabled={busy !== null || !settings.connectionId}><Save />Salvar diária</Button></form></section>
    </div>
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div><h2 className="font-semibold">Vínculos de cadastros</h2><p className="mt-1 text-sm text-slate-600">{settings.unmatchedEmployees} pessoas e {settings.unmatchedGeofences} locais sem vínculo. Um vínculo não cria nem altera cadastros no RHiD.</p></div>
      <div className="flex flex-wrap gap-1" aria-label="Tipo de vínculo"><Button variant={mappingKind === "employees" ? "secondary" : "ghost"} aria-pressed={mappingKind === "employees"} onClick={() => setMappingKind("employees")}>Funcionários</Button><Button variant={mappingKind === "geofences" ? "secondary" : "ghost"} aria-pressed={mappingKind === "geofences"} onClick={() => setMappingKind("geofences")}>Locais e obras</Button></div>
      {settings.connectionId ? <MappingList key={mappingKind} kind={mappingKind} /> : <p className="text-sm text-slate-500">Salve a configuração e sincronize o RHiD para carregar os cadastros.</p>}
    </section>
    <Dialog open={companyConfirm !== null} onOpenChange={(open) => { if (!open) setCompanyConfirm(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar troca de empresa</DialogTitle>
          <DialogDescription>
            Alterar o código da empresa no RHiD cria um novo espaço de dados. Os registros da empresa atual deixam de ser a fonte ativa e não são misturados com a nova empresa.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompanyConfirm(null)}>Cancelar</Button>
          <Button disabled={busy !== null} onClick={() => {
            if (!companyConfirm) return;
            const payload = companyConfirm;
            setCompanyConfirm(null);
            void perform("connection", () => configure(payload), "Configuração salva");
          }}>Confirmar nova empresa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function MappingList({ kind }: { kind: "employees" | "geofences" }) {
  const { results, status, loadMore } = usePaginatedQuery(api.attendance.listMappings, { kind }, { initialNumItems: 30 });
  const linkEmployee = useMutation(api.attendance.linkEmployee);
  const linkGeofence = useMutation(api.attendance.linkGeofence);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const employeeOptions = useQuery(api.attendance.employeeOptions, kind === "employees" && editing !== null ? { search: search.trim() || undefined } : "skip");
  const projectOptions = useQuery(api.attendance.projectOptions, kind === "geofences" && editing !== null ? { search: search.trim() || undefined } : "skip");
  const options = kind === "employees" ? employeeOptions : projectOptions;
  async function save(sourceId: string, unlink = false) {
    setSaving(true);
    const employee = employeeOptions?.find((option) => option._id === targetId);
    const project = projectOptions?.find((option) => option._id === targetId);
    if (!unlink && !(kind === "employees" ? employee : project)) { toast.error("Selecione um cadastro para vincular."); setSaving(false); return; }
    const success = await runWithToast(
      () => kind === "employees" ? linkEmployee({ sourceId, employeeId: unlink ? null : employee!._id }) : linkGeofence({ sourceId, projectId: unlink ? null : project!._id }),
      unlink ? "Vínculo removido" : "Vínculo salvo",
      "Não foi possível salvar o vínculo",
    );
    if (success) { setEditing(null); setSearch(""); setTargetId(""); }
    setSaving(false);
  }
  if (status === "LoadingFirstPage") return <p role="status" className="text-sm text-slate-500">Carregando cadastros…</p>;
  return <div className="space-y-3">
    {!results.length ? <p className="py-4 text-sm text-slate-500">Nenhum cadastro sincronizado. Solicite a sincronização para começar.</p> : null}
    <ul className="divide-y divide-slate-100">{results.map((row) => {
      const linked = kind === "employees" ? row.employeeId : row.projectId;
      return <li key={row.sourceId} className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{row.sourceName}</p><p className="mt-1 text-xs text-slate-500">RHiD {row.sourceId}{row.department ? ` · ${row.department}` : ""}{!row.active ? " · Inativo" : ""}</p><p className={`mt-1 text-xs ${linked ? "text-slate-500" : "text-amber-800"}`}>{linked ? "Cadastro vinculado" : "Sem vínculo"}</p></div><Button variant="outline" size="sm" disabled={saving} onClick={() => { setEditing(row.sourceId); setSearch(""); setTargetId(""); }}><Link2 />{linked ? "Alterar" : "Vincular"}</Button></div>
        {editing === row.sourceId ? <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block space-y-1 text-sm font-medium">{kind === "employees" ? "Buscar funcionário do RH" : "Buscar obra do ERP"}<Input value={search} onChange={(event) => { setSearch(event.target.value); setTargetId(""); }} placeholder="Digite um nome" /></label>
          <label className="block space-y-1 text-sm font-medium">{kind === "employees" ? "Funcionário" : "Obra"}<select className={selectClass} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">{options === undefined ? "Carregando…" : "Selecione um cadastro"}</option>{options?.map((option) => <option key={option._id} value={option._id}>{option.name}</option>)}</select></label>
          {options?.length === 0 ? <p className="text-xs text-slate-500">Nenhum cadastro corresponde à busca.</p> : null}
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={saving || !targetId} onClick={() => void save(row.sourceId)}><Check />Salvar vínculo</Button>{linked ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void save(row.sourceId, true)}>Remover vínculo</Button> : null}<Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}><X />Cancelar</Button></div>
        </div> : null}
      </li>;
    })}</ul>
    {status === "CanLoadMore" || status === "LoadingMore" ? <Button variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(30)}>{status === "LoadingMore" ? "Carregando…" : "Carregar mais cadastros"}</Button> : null}
  </div>;
}
