import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Plus, User } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import {
  Chips,
  EmptyState,
  IconButton,
  ListRow,
  LoadingState,
  Pill,
  ScreenHeader,
  SearchField,
  screenStyles,
} from "@/components/ui";
import { formatTaxId } from "@/lib/format";
import { colors, space } from "@/lib/theme";

import type { PartyAdapter, PartyRow } from "./adapter";
import { PartyDetailSheet } from "./party-detail-sheet";
import { PartyFormSheet } from "./party-form-sheet";

type Scope = "active" | "archived";

/** Lista genérica de clientes/empreiteiros com busca, criação e detalhe. */
export function PartyListScreen({ adapter, subtitle }: { adapter: PartyAdapter; subtitle: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useQuery(adapter.list, {
    search: search.trim() || undefined,
    includeArchived: scope === "archived",
  }) as PartyRow[] | undefined;
  const visible = rows?.filter((row) => (scope === "archived" ? Boolean(row.archivedAt) : !row.archivedAt));

  const Icon = adapter.icon;
  const lower = adapter.plural.toLowerCase();

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={adapter.plural}
        subtitle={visible === undefined ? subtitle : `${visible.length} ${visible.length === 1 ? adapter.singular.toLowerCase() : lower}`}
        onBack={() => router.back()}
        right={
          <IconButton
            label={`Novo ${adapter.singular.toLowerCase()}`}
            tone="primary"
            icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />}
            onPress={() => setCreating(true)}
          />
        }
      />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Nome, razão social ou CNPJ"
        containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }}
      />
      <Chips<Scope>
        active={scope}
        onChange={setScope}
        items={[
          { key: "active", label: "Ativos" },
          { key: "archived", label: "Arquivados" },
        ]}
      />

      {visible === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon size={30} color={colors.primary} strokeWidth={1.8} />}
              title={search ? "Nada encontrado" : scope === "archived" ? `Nenhum ${adapter.singular.toLowerCase()} arquivado` : `Nenhum ${adapter.singular.toLowerCase()} ainda`}
              description={search ? `Nenhum ${adapter.singular.toLowerCase()} corresponde à busca.` : scope === "archived" ? undefined : "Toque em + para cadastrar o primeiro."}
              actionLabel={!search && scope === "active" ? `Novo ${adapter.singular.toLowerCase()}` : undefined}
              onAction={() => setCreating(true)}
            />
          }
          renderItem={({ item }) => {
            const RowIcon = item.personType === "pf" ? User : Icon;
            const subtitleText = [
              item.legalName && item.legalName !== item.name ? item.legalName : null,
              formatTaxId(item.taxId),
              item.phone,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListRow
                icon={<RowIcon size={22} color={colors.primary} strokeWidth={1.8} />}
                title={item.name}
                subtitle={subtitleText || item.email}
                trailing={
                  item.archivedAt ? <Pill label="Arquivado" tone="neutral" /> : !item.active ? <Pill label="Inativo" tone="warning" /> : undefined
                }
                onPress={() => setSelectedId(item._id)}
              />
            );
          }}
        />
      )}

      <PartyFormSheet adapter={adapter} open={creating} onClose={() => setCreating(false)} onSaved={(id) => setSelectedId(id)} />
      <PartyDetailSheet adapter={adapter} partyId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}
