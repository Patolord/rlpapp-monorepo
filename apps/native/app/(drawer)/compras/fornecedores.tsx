import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Plus, Truck } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { SupplierDetailSheet, SupplierFormSheet } from "@/components/compras/supplier-sheets";
import { Chips, EmptyState, IconButton, ListRow, LoadingState, Pill, ScreenHeader, SearchField, screenStyles } from "@/components/ui";
import { colors, space } from "@/lib/theme";

type Scope = "active" | "all";

export default function FornecedoresScreen() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"suppliers"> | null>(null);
  const suppliers = useQuery(api.suppliers.list, { search: search.trim() || undefined, activeOnly: scope === "active" });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Fornecedores"
        subtitle={suppliers === undefined ? "Parceiros de compra" : `${suppliers.length} fornecedor${suppliers.length === 1 ? "" : "es"}`}
        right={<IconButton label="Novo fornecedor" tone="primary" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setCreating(true)} />}
      />
      <SearchField value={search} onChangeText={setSearch} placeholder="Nome ou categoria" containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }} />
      <Chips<Scope> active={scope} onChange={setScope} items={[{ key: "active", label: "Ativos" }, { key: "all", label: "Todos" }]} />
      {suppliers === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon={<Truck size={30} color={colors.primary} strokeWidth={1.8} />} title={search ? "Nada encontrado" : "Nenhum fornecedor"} description={search ? "Nenhum fornecedor corresponde à busca." : "Toque em + para cadastrar o primeiro."} actionLabel={!search ? "Novo fornecedor" : undefined} onAction={() => setCreating(true)} />
          }
          renderItem={({ item }) => (
            <ListRow
              icon={<Truck size={22} color={colors.primary} strokeWidth={1.8} />}
              title={item.name}
              subtitle={item.categories?.join(" · ") || item.notes}
              trailing={!item.active ? <Pill label="Inativo" tone="warning" /> : undefined}
              onPress={() => setSelectedId(item._id)}
            />
          )}
        />
      )}
      <SupplierFormSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => setSelectedId(id)} />
      <SupplierDetailSheet supplierId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}
