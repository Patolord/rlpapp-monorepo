import { api } from "@rlpapp/backend/convex/_generated/api";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Check, ExternalLink, QrCode, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, ConfirmDialog, EmptyState, LoadingState, Pill, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { WEB_URL, openUrl } from "@/lib/links";
import { useNativeHeaderOptions } from "@/lib/native-header";
import { colors, radius, space, type } from "@/lib/theme";

/** Lote de etiquetas (ficha G5): códigos e excluir só os livres. Imprimir fica no web. */
export default function LoteScreen() {
  const header = useNativeHeaderOptions();
  const router = useRouter();
  const toast = useToast();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { results, status, loadMore } = usePaginatedQuery(api.qrCodes.listByBatch, { batchId: batchId! }, { initialNumItems: 100 });
  const removeMany = useMutation(api.qrCodes.removeMany);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const name = results[0]?.batchName ?? "Lote";
  const free = results.filter((q) => !q.equipment);

  function toggle(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  async function doRemove() {
    setBusy(true);
    try {
      const result = await removeMany({ tokens: [...selected] });
      toast.success(`${result.deleted.length} ${result.deleted.length === 1 ? "etiqueta excluída" : "etiquetas excluídas"}${result.blocked.length ? `; ${result.blocked.length} em uso ficaram` : ""}`);
      setSelected(new Set());
      setSelecting(false);
      setConfirm(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para excluir"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ ...header, title: name }} />
      {status === "LoadingFirstPage" ? (
        <LoadingState />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(q) => q._id}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => status === "CanLoadMore" && loadMore(100)}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={[type.bodySm, { color: colors.textSecondaryOnBg }]}>
                {results.length} {results.length === 1 ? "etiqueta" : "etiquetas"} · {free.length} {free.length === 1 ? "livre" : "livres"}
              </Text>
              <View style={styles.actions}>
                <AppButton label="Imprimir no web" variant="secondary" size="sm" icon={<ExternalLink size={16} color={colors.text} />} onPress={() => openUrl(`${WEB_URL}/engenharia/qr-codes`)} style={{ flex: 1 }} />
                {free.length > 0 ? (
                  <AppButton
                    label={selecting ? "Cancelar" : "Excluir livres"}
                    variant={selecting ? "secondary" : "danger"}
                    size="sm"
                    onPress={() => {
                      setSelecting((v) => !v);
                      setSelected(new Set());
                    }}
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
              {selecting ? (
                <View style={styles.actions}>
                  <AppButton label={selected.size === free.length ? "Desmarcar todas" : "Marcar todas as livres"} variant="ghost" size="sm" onPress={() => setSelected(selected.size === free.length ? new Set() : new Set(free.map((q) => q.token)))} style={{ flex: 1 }} />
                  <AppButton label={`Excluir (${selected.size})`} variant="danger" size="sm" icon={<Trash2 size={16} color={colors.destructive} />} disabled={selected.size === 0} onPress={() => setConfirm(true)} style={{ flex: 1 }} />
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const isFree = !item.equipment;
            const checked = selected.has(item.token);
            return (
              <Pressable
                onPress={() => (selecting ? isFree && toggle(item.token) : router.push(`/equipamento/${item.token}` as Href))}
                accessibilityRole={selecting ? "checkbox" : "button"}
                accessibilityState={selecting ? { checked, disabled: !isFree } : undefined}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }, selecting && !isFree && { opacity: 0.5 }]}
              >
                {selecting ? (
                  <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}</View>
                ) : (
                  <QrCode size={20} color={colors.primary} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>{item.token}</Text>
                  {item.equipment?.description ? <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>{item.equipment.description}</Text> : null}
                </View>
                {item.equipment ? <StatusBadge status={item.equipment.status} /> : <Pill label="Livre" dot={false} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState title="Lote vazio" />}
          ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
        />
      )}
      <ConfirmDialog
        open={confirm}
        title={`Excluir ${selected.size} ${selected.size === 1 ? "etiqueta livre" : "etiquetas livres"}?`}
        description="Só etiquetas sem equipamento são excluídas. Se já estiverem impressas e coladas, deixam de funcionar. Não dá para desfazer."
        confirmLabel="Excluir"
        destructive
        busy={busy}
        onConfirm={() => void doRemove()}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: 1 },
  header: { gap: space.md, marginBottom: space.md },
  actions: { flexDirection: "row", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surface, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56, borderRadius: radius.sm },
  box: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.controlBorder, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
