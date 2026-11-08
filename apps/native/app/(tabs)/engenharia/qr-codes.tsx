import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Building2, Layers, Plus, QrCode } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, Banner, EmptyState, Field, LoadingState, MetricStrip, Pill, PickerField, SearchField, SectionTitle, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";

type NoProject = FunctionReturnType<typeof api.qrCodes.listBatchesWithoutProject>[number];

const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateToken(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_CHARS.charAt(Math.floor(Math.random() * TOKEN_CHARS.length));
  return out;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Etiquetas QR (fichas G4, G6 e G7): números, lotes, busca, gerar lote e dar obra a lote. */
export default function QrCodesScreen() {
  const router = useRouter();
  const stats = useQuery(api.qrCodes.stats, {});
  const batches = useQuery(api.qrCodes.listBatches, { limit: 50 });
  const noProject = useQuery(api.qrCodes.listBatchesWithoutProject, {});
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 300);
  const results = useQuery(api.qrCodes.search, term.length >= 2 ? { term } : "skip");
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState<NoProject | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={term.length >= 2 ? [] : (batches ?? [])}
        keyExtractor={(b) => b.batchId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            {stats ? (
              <MetricStrip
                items={[
                  { label: "Etiquetas", value: stats.capped ? `${stats.total}+` : stats.total },
                  { label: "Com equipamento", value: stats.linked },
                  { label: "Livres", value: stats.free },
                ]}
              />
            ) : null}
            <AppButton label="Gerar lote" block icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setGenerating(true)} />
            {noProject && noProject.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Banner tone="warning" title={`${noProject.length} ${noProject.length === 1 ? "lote sem obra" : "lotes sem obra"}`} detail="Toda etiqueta precisa de uma obra para aparecer para os técnicos." />
                {noProject.map((b) => (
                  <Surface key={b.batchId} onPress={() => setAssigning(b)} accessibilityLabel={`Lote ${b.batchName ?? b.batchId} sem obra`}>
                    <View style={styles.row}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>{b.batchName ?? "Lote sem nome"}</Text>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>{b.total} etiquetas · {b.registered} cadastradas · {formatDateTime(b.createdAt)}</Text>
                      </View>
                      <AppButton label="Dar obra" variant="secondary" size="sm" onPress={() => setAssigning(b)} />
                    </View>
                  </Surface>
                ))}
              </View>
            ) : null}
            <SearchField value={search} onChangeText={setSearch} placeholder="Código ou nome do lote" autoCapitalize="characters" autoCorrect={false} />
            {term.length >= 2 ? (
              results === undefined ? (
                <LoadingState />
              ) : results.qrCodes.length === 0 && results.batches.length === 0 ? (
                <EmptyState title="Nada com essa busca" />
              ) : (
                <View style={{ gap: space.sm }}>
                  {results.batches.map((b) => (
                    <Surface key={b.batchId} onPress={() => router.push(`/lote/${b.batchId}` as Href)}>
                      <View style={styles.row}>
                        <Layers size={20} color={colors.primary} />
                        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{b.batchName ?? "Lote sem nome"}</Text>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>{b.count} etiquetas</Text>
                      </View>
                    </Surface>
                  ))}
                  {results.qrCodes.map((q) => (
                    <Surface key={q._id} onPress={() => router.push(`/equipamento/${q.token}` as Href)}>
                      <View style={styles.row}>
                        <QrCode size={20} color={colors.primary} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[type.bodyStrong, { color: colors.text }]}>{q.token}</Text>
                          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>{q.equipment?.description ?? q.batchName ?? "Livre"}</Text>
                        </View>
                        {q.equipment ? <StatusBadge status={q.equipment.status} /> : <Pill label="Livre" dot={false} />}
                      </View>
                    </Surface>
                  ))}
                </View>
              )
            ) : (
              <SectionTitle title="Lotes" />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Surface onPress={() => router.push(`/lote/${item.batchId}` as Href)} accessibilityLabel={`Lote ${item.batchName ?? ""}`}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <Layers size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.batchName ?? "Lote sem nome"}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.count} etiquetas · {formatDateTime(item.createdAt)}
                </Text>
              </View>
              {item.projectName ? <Pill label={item.projectName} dot={false} /> : <Pill label="Sem obra" tone="warning" />}
            </View>
          </Surface>
        )}
        ListEmptyComponent={term.length >= 2 ? null : batches === undefined ? <LoadingState /> : <EmptyState icon={<QrCode size={28} color={colors.primary} />} title="Nenhum lote ainda" description="Gere um lote de etiquetas para uma obra; a impressão é feita no web." />}
      />
      <GenerateBatchSheet open={generating} onClose={() => setGenerating(false)} onCreated={(batchId) => router.push(`/lote/${batchId}` as Href)} />
      <AssignProjectSheet batch={assigning} onClose={() => setAssigning(null)} />
    </View>
  );
}

/** Gerar lote (G6): nome, obra (obrigatória), quantidade e prefixo. */
function GenerateBatchSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (batchId: string) => void }) {
  const toast = useToast();
  const projects = useQuery(api.projects.list, open ? {} : "skip");
  const batchCreate = useMutation(api.qrCodes.batchCreate);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [prefix, setPrefix] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setProjectId(null);
    setQuantity("");
    setPrefix("");
    setTried(false);
    setError(null);
  }, [open]);

  const qty = Number(quantity);
  const errors = {
    project: projectId ? undefined : "Escolha a obra do lote",
    quantity: Number.isInteger(qty) && qty >= 1 && qty <= 999 ? undefined : "Entre 1 e 999",
  };

  async function submit() {
    setTried(true);
    if (errors.project || errors.quantity || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const p = prefix.trim().toUpperCase();
      const tokens = Array.from({ length: qty }, () => (p ? `${p}-${generateToken(6)}` : generateToken(8)));
      const result = await batchCreate({ tokens, batchName: name.trim() || undefined, projectId: projectId as Id<"projects"> });
      toast.success(`${result.created.length} ${result.created.length === 1 ? "etiqueta gerada" : "etiquetas geradas"}`);
      onClose();
      onCreated(result.batchId);
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para gerar o lote. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Gerar lote de etiquetas" footer={<AppButton label="Gerar etiquetas" block loading={saving} loadingLabel="Gerando…" onPress={() => void submit()} />}>
      <View style={{ gap: space.lg }}>
        <Field label="Nome do lote (opcional)" value={name} onChangeText={setName} placeholder="Ex.: Torre A — evaporadoras" />
        <PickerField label="Obra" value={projectId} onChange={setProjectId} options={(projects ?? []).map((p) => ({ value: p._id as string, label: p.name }))} searchable loading={projects === undefined} placeholder="Escolha a obra" error={tried ? errors.project : undefined} />
        <Field label="Quantidade" value={quantity} onChangeText={(v) => setQuantity(v.replace(/\D/g, ""))} keyboardType="number-pad" error={tried ? errors.quantity : undefined} />
        <Field label="Prefixo (opcional)" value={prefix} onChangeText={(v) => setPrefix(v.replace(/[^A-Za-z0-9]/g, "").slice(0, 8))} autoCapitalize="characters" helper="Os códigos ficam como PREFIXO-XXXXXX." />
        <Text style={[type.caption, { color: colors.textSecondary }]}>Para imprimir as etiquetas, abra o lote no web.</Text>
        {error ? <Banner tone="danger" title={error} /> : null}
      </View>
    </Sheet>
  );
}

/** Dar obra ao lote (G7). */
function AssignProjectSheet({ batch, onClose }: { batch: NoProject | null; onClose: () => void }) {
  const toast = useToast();
  const projects = useQuery(api.projects.list, batch ? {} : "skip");
  const setBatchProject = useMutation(api.qrCodes.setBatchProject);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setProjectId(null), [batch]);

  async function save() {
    if (!batch || !projectId) return;
    setSaving(true);
    try {
      const result = await setBatchProject({ batchId: batch.batchId, projectId: projectId as Id<"projects"> });
      toast.success(`${result.updated} ${result.updated === 1 ? "etiqueta passou" : "etiquetas passaram"} para a obra`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para dar a obra ao lote"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={batch !== null} onClose={onClose} title={batch?.batchName ?? "Lote sem nome"} subtitle={batch ? `${batch.total} etiquetas · ${batch.registered} cadastradas` : undefined} footer={<AppButton label="Dar obra ao lote" block disabled={!projectId} loading={saving} onPress={() => void save()} />}>
      <PickerField label="Obra" value={projectId} onChange={setProjectId} options={(projects ?? []).map((p) => ({ value: p._id as string, label: p.name }))} searchable loading={projects === undefined} placeholder="Escolha a obra" />
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md, alignItems: "center" }}>
        <Building2 size={16} color={colors.icon} />
        <Text style={[type.bodySm, { color: colors.textSecondary, flex: 1 }]}>Etiquetas de equipamentos já posicionados num item planejado ficam com a obra desse item.</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
