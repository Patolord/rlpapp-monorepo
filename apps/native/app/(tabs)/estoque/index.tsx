import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, MapPin, Package, Truck } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { MovementFormSheet } from "@/components/estoque/movement-form-sheet";
import { REPLENISHMENT, type MovementType, type ReplenishmentState } from "@/components/estoque/labels";
import { AppButton, Banner, Chips, EmptyState, Field, KeyValueList, LoadingState, Pill, SearchField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Balance = FunctionReturnType<typeof api.inventory.listBalances>["page"][number];
type Filter = "todos" | ReplenishmentState;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Estoque central (ficha E1): saúde do estoque, busca no estoque inteiro e saldos. */
export default function EstoqueCentralScreen() {
  const params = useLocalSearchParams<{ filtro?: string }>();
  const access = useQuery(api.inventory.getAccess, {});
  const canView = access?.canViewCentral === true;
  const health = useQuery(api.inventory.centralHealth, canView ? {} : "skip");
  const [filter, setFilter] = useState<Filter>(params.filtro === "repor" ? "reorder" : "todos");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 300);
  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.listBalances,
    canView ? { search: term || undefined } : "skip",
    { initialNumItems: 60 }
  );
  const [selected, setSelected] = useState<Balance | null>(null);
  const [movement, setMovement] = useState<MovementType | null>(null);

  useEffect(() => {
    if (params.filtro === "repor") setFilter("reorder");
  }, [params.filtro]);

  const visible = useMemo(() => {
    if (filter === "todos") return results;
    // "Repor" no aviso N13 inclui o crítico: os dois pedem compra.
    if (filter === "reorder") return results.filter((b) => b.replenishmentState === "reorder" || b.replenishmentState === "below_minimum");
    return results.filter((b) => b.replenishmentState === filter);
  }, [results, filter]);

  if (access === undefined) return <LoadingState />;
  if (!canView) {
    return (
      <View style={styles.pad}>
        <EmptyState
          title="Estoque central só para Estoque e Compras"
          description="A engenharia consulta o estoque de cada obra em Obras › obra › Estoque."
        />
      </View>
    );
  }

  const loadingMore = status === "LoadingMore";

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => status === "CanLoadMore" && loadMore(60)}
        ListHeaderComponent={
          <View style={styles.header}>
            {access.canWriteCentral || access.canCreateEntry ? (
              <View style={styles.actions}>
                {access.canCreateEntry ? (
                  <AppButton label="Entrada" variant="secondary" size="sm" icon={<ArrowDownToLine size={16} color={colors.text} />} onPress={() => setMovement("entry")} style={{ flex: 1 }} />
                ) : null}
                {access.canWriteCentral ? (
                  <AppButton label="Enviar para obra" size="sm" icon={<Truck size={16} color={colors.onPrimary} />} onPress={() => setMovement("transfer")} style={{ flex: 1 }} />
                ) : null}
              </View>
            ) : null}
            <SearchField value={search} onChangeText={setSearch} placeholder="Material, SKU ou variação" autoCorrect={false} />
            <Chips<Filter>
              active={filter}
              onChange={setFilter}
              style={{ paddingHorizontal: 0 }}
              items={[
                { key: "todos", label: "Todos" },
                { key: "below_minimum", label: "Crítico", count: health?.critical },
                { key: "reorder", label: "Repor", count: health ? health.reorder + health.critical : undefined },
                { key: "healthy", label: "OK", count: health?.healthy },
                { key: "unconfigured", label: "Sem política", count: health?.unconfigured },
              ]}
            />
            {term ? (
              <Text style={styles.hint}>
                {results.length === 0 ? "" : `${results.length} ${results.length === 1 ? "material encontrado" : "materiais encontrados"} no estoque inteiro`}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <BalanceRow balance={item} onPress={() => setSelected(item)} />}
        ListEmptyComponent={
          status === "LoadingFirstPage" ? (
            <LoadingState />
          ) : (
            <EmptyState
              icon={<Package size={28} color={colors.primary} />}
              title={term ? "Nada com essa busca" : filter !== "todos" ? "Nada nesta situação" : "Estoque vazio"}
              description={term ? "Confira o nome ou o SKU." : filter !== "todos" ? undefined : "As entradas registradas aparecem aqui."}
              actionLabel={filter !== "todos" ? "Ver todos" : undefined}
              onAction={() => setFilter("todos")}
            />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: space.lg }} /> : null}
      />

      <BalanceSheet balance={selected} canEdit={access.canWriteCentral} onClose={() => setSelected(null)} onMove={(t) => { setSelected(null); setMovement(t); }} />
      <MovementFormSheet open={movement !== null} onClose={() => setMovement(null)} lockType={movement ?? undefined} />
    </View>
  );
}

function BalanceRow({ balance, onPress }: { balance: Balance; onPress: () => void }) {
  const state = REPLENISHMENT[balance.replenishmentState as ReplenishmentState] ?? REPLENISHMENT.unconfigured;
  return (
    <Surface onPress={onPress} accessibilityLabel={`${balance.materialName}, ${formatQty(balance.quantity, balance.unit)}, ${state.label}`}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
            {formatMaterialLabel(balance.materialName, balance.variantLabel)}
          </Text>
          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
            {[balance.materialSku, balance.physicalAddress ? `End. ${balance.physicalAddress}` : null].filter(Boolean).join(" · ") || "Sem endereço"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[type.heading, { color: colors.text }]}>{formatQty(balance.quantity, balance.unit)}</Text>
          <Pill label={state.label} tone={state.tone} />
        </View>
      </View>
    </Surface>
  );
}

/** Material no estoque (E2) com o endereço físico editável (E3). */
function BalanceSheet({
  balance,
  canEdit,
  onClose,
  onMove,
}: {
  balance: Balance | null;
  canEdit: boolean;
  onClose: () => void;
  onMove: (type: MovementType) => void;
}) {
  const toast = useToast();
  const updateAddress = useMutation(api.inventory.updatePhysicalAddress);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAddress(balance?.physicalAddress ?? "");
    setEditing(false);
  }, [balance]);

  async function save() {
    if (!balance) return;
    setSaving(true);
    try {
      await updateAddress({ balanceId: balance._id, physicalAddress: address.trim() });
      toast.success("Endereço salvo");
      setEditing(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar o endereço"));
    } finally {
      setSaving(false);
    }
  }

  const state = balance ? REPLENISHMENT[balance.replenishmentState as ReplenishmentState] ?? REPLENISHMENT.unconfigured : null;
  const unit = balance?.unit ?? null;

  return (
    <Sheet open={balance !== null} onClose={onClose} title={balance ? formatMaterialLabel(balance.materialName, balance.variantLabel) : ""} subtitle={balance?.materialSku ?? undefined}>
      {balance && state ? (
        <View style={{ gap: space.lg }}>
          <View style={styles.qty}>
            <Text style={[type.display, { color: colors.text }]}>{formatQty(balance.quantity, unit)}</Text>
            <Pill label={state.label} tone={state.tone} />
          </View>
          {balance.replenishmentState === "unconfigured" ? (
            <Banner tone="neutral" title="Sem política de reposição" detail="Mínimo, ponto de reposição e alvo são definidos no web, em Compras." />
          ) : (
            <KeyValueList
              items={[
                { label: "Mínimo", value: balance.minimumQuantity !== null ? formatQty(balance.minimumQuantity, unit) : null },
                { label: "Ponto de reposição", value: balance.reorderPoint !== null ? formatQty(balance.reorderPoint, unit) : null },
                { label: "Alvo", value: balance.targetQuantity !== null ? formatQty(balance.targetQuantity, unit) : null },
                { label: "Prazo de entrega", value: balance.leadTimeDays !== null ? `${balance.leadTimeDays} dias` : null },
                { label: "Sugestão de compra", value: balance.suggestedOrderQuantity ? formatQty(balance.suggestedOrderQuantity, unit) : null },
              ]}
            />
          )}

          {editing ? (
            <View style={{ gap: space.sm }}>
              <Field label="Endereço físico" value={address} onChangeText={setAddress} placeholder="Ex.: Prateleira B3, caixa 12" autoFocus />
              <View style={styles.actions}>
                <AppButton label="Cancelar" variant="secondary" size="sm" disabled={saving} onPress={() => { setAddress(balance.physicalAddress ?? ""); setEditing(false); }} style={{ flex: 1 }} />
                <AppButton label="Salvar" size="sm" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Surface style={styles.address}>
              <MapPin size={18} color={colors.icon} />
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: colors.textSecondary }]}>Endereço físico</Text>
                <Text style={[type.body, { color: balance.physicalAddress ? colors.text : colors.textSecondary }]}>{balance.physicalAddress || "Não informado"}</Text>
              </View>
              {canEdit ? <AppButton label="Editar" variant="ghost" size="sm" onPress={() => setEditing(true)} /> : null}
            </Surface>
          )}

          {canEdit ? (
            <View style={styles.actions}>
              <AppButton label="Ajustar saldo" variant="secondary" size="sm" onPress={() => onMove("adjustment")} style={{ flex: 1 }} />
              <AppButton label="Enviar para obra" size="sm" onPress={() => onMove("transfer")} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.screen },
  list: { padding: space.screen, paddingBottom: 96, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  actions: { flexDirection: "row", gap: space.sm },
  hint: { ...type.caption, color: colors.textSecondaryOnBg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  qty: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  address: { flexDirection: "row", alignItems: "center", gap: space.md },
});
