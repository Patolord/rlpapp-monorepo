import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { FileText, Plus } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ContractDetailSheet } from "@/components/engenharia/contracts/contract-detail-sheet";
import { ContractFormSheet } from "@/components/engenharia/contracts/contract-form-sheet";
import { DIRECTION_SHORT, DIRECTION_TONE, KIND_LABELS, type ContractDirection } from "@/components/engenharia/contracts/labels";
import {
  Chips,
  EmptyState,
  IconButton,
  LoadingState,
  Pill,
  ScreenHeader,
  SearchField,
  Surface,
  screenStyles,
} from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

type Filter = "all" | ContractDirection;

export default function ContratosScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"contracts"> | null>(null);

  const contracts = useQuery(api.contracts.list, {
    search: search.trim() || undefined,
    direction: filter === "all" ? undefined : filter,
  });
  const totalCents = contracts?.reduce((sum, c) => sum + c.valueCents, 0) ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Contratos"
        subtitle={contracts === undefined ? "Gerencie todos os contratos" : `${contracts.length} contrato${contracts.length === 1 ? "" : "s"} · ${formatCurrency(totalCents)}`}
        onBack={() => router.back()}
        right={
          <IconButton
            label="Novo contrato"
            tone="primary"
            icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
            onPress={() => setCreating(true)}
          />
        }
      />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Título, obra, cliente ou empreiteiro"
        containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }}
      />
      <Chips<Filter>
        active={filter}
        onChange={setFilter}
        items={[
          { key: "all", label: "Todos" },
          { key: "client_sale", label: "Venda ao cliente" },
          { key: "contractor_hire", label: "Empreiteiros" },
        ]}
      />

      {contracts === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={contracts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<FileText size={30} color={colors.primary} strokeWidth={1.8} />}
              title={search ? "Nada encontrado" : "Nenhum contrato ainda"}
              description={search ? "Nenhum contrato corresponde à busca." : "Toque em + para criar o primeiro contrato."}
              actionLabel={!search ? "Novo contrato" : undefined}
              onAction={() => setCreating(true)}
            />
          }
          renderItem={({ item }) => {
            const counterparty = item.customerName ?? item.contractorName;
            return (
              <Surface onPress={() => setSelectedId(item._id)} style={{ gap: space.sm }}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {counterparty ? (
                      <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
                        {counterparty}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(item.valueCents)}</Text>
                </View>
                <View style={styles.meta}>
                  <Pill label={DIRECTION_SHORT[item.direction]} tone={DIRECTION_TONE[item.direction]} />
                  {item.kind === "addendum" ? <Pill label={KIND_LABELS.addendum} tone="neutral" /> : null}
                  {item.projectName ? (
                    <Text style={[type.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                      {item.projectName}
                    </Text>
                  ) : null}
                </View>
              </Surface>
            );
          }}
        />
      )}

      <ContractFormSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => setSelectedId(id)} />
      <ContractDetailSheet contractId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
