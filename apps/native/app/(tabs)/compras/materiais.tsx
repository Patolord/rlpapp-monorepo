import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Package, Plus } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { MATERIAL_STATUS } from "@/components/compras/labels";
import { MaterialDetailSheet } from "@/components/compras/material-detail-sheet";
import { MaterialFormSheet } from "@/components/compras/material-form-sheet";
import { Chips, EmptyState, IconButton, ListRow, LoadingState, Pill, ScreenHeader, SearchField, screenStyles } from "@/components/ui";
import { formatMaterialLabel } from "@/lib/format";
import { colors, space } from "@/lib/theme";

type Scope = "active" | "all";

export default function MateriaisScreen() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"materials"> | null>(null);

  const materials = useQuery(api.materials.list, { search: search.trim() || undefined, activeOnly: scope === "active" });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Materiais"
        subtitle={materials === undefined ? "Catálogo da empresa" : `${materials.length} ${materials.length === 1 ? "material" : "materiais"}`}
        right={<IconButton label="Novo material" tone="primary" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setCreating(true)} />}
      />
      <SearchField value={search} onChangeText={setSearch} placeholder="Nome, SKU ou categoria" containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }} />
      <Chips<Scope>
        active={scope}
        onChange={setScope}
        items={[
          { key: "active", label: "Ativos" },
          { key: "all", label: "Todos" },
        ]}
      />
      {materials === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={materials}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={30} color={colors.primary} strokeWidth={1.8} />}
              title={search ? "Nada encontrado" : "Nenhum material"}
              description={search ? "Nenhum material corresponde à busca." : "Toque em + para cadastrar o primeiro material."}
              actionLabel={!search ? "Novo material" : undefined}
              onAction={() => setCreating(true)}
            />
          }
          renderItem={({ item }) => {
            const status = item.status ?? (item.active ? "active" : "archived");
            return (
              <ListRow
                icon={<Package size={22} color={colors.primary} strokeWidth={1.8} />}
                title={formatMaterialLabel(item.name, item.variantLabel)}
                subtitle={[item.sku, item.category, item.unit].filter(Boolean).join(" · ") || null}
                trailing={status !== "active" ? <Pill label={MATERIAL_STATUS[status]?.label ?? status} tone={MATERIAL_STATUS[status]?.tone ?? "neutral"} /> : undefined}
                onPress={() => setSelectedId(item._id)}
              />
            );
          }}
        />
      )}
      <MaterialFormSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => setSelectedId(id)} />
      <MaterialDetailSheet materialId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}
