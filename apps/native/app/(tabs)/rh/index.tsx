import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Plus, User, Users } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { EmployeeFormSheet } from "@/components/rh/employee-form-sheet";
import { EMPLOYEE_STATUS, type EmployeeStatus } from "@/components/rh/labels";
import { Banner, Chips, EmptyState, IconButton, ListRow, LoadingState, Pill, ScreenHeader, SearchField, screenStyles } from "@/components/ui";
import { colors, space } from "@/lib/theme";

type Filter = EmployeeStatus | "archived";

export default function FuncionariosScreen() {
  const router = useRouter();
  const open = (id: string) => router.push(`/funcionario/${id}` as Href);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(false);

  const employees = useQuery(api.employees.list, {
    search: search.trim() || undefined,
    includeArchived: filter === "archived",
    status: filter === "archived" ? undefined : filter,
  });
  const visible = employees?.filter((e) => (filter === "archived" ? Boolean(e.archivedAt) : !e.archivedAt));
  const withoutUser = filter === "active" ? (visible ?? []).filter((e) => !e.userId).length : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Funcionários"
        subtitle={visible === undefined ? "Equipe e parâmetros de folha" : `${visible.length} funcionário${visible.length === 1 ? "" : "s"}`}
        right={<IconButton label="Novo funcionário" tone="primary" icon={<Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />} onPress={() => setCreating(true)} />}
      />
      <SearchField value={search} onChangeText={setSearch} placeholder="Nome, código ou cargo" containerStyle={{ marginHorizontal: space.screen, marginBottom: space.md }} />
      <Chips<Filter>
        active={filter}
        onChange={setFilter}
        items={[
          { key: "active", label: "Ativos" },
          { key: "on_leave", label: "Afastados" },
          { key: "terminated", label: "Desligados" },
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
          ListHeaderComponent={
            withoutUser > 0 ? (
              <Banner
                tone="info"
                title={`${withoutUser} ${withoutUser === 1 ? "funcionário sem usuário" : "funcionários sem usuário"} do app`}
                detail="Sem usuário vinculado, a pessoa não marca o ponto pelo celular. Abra o funcionário para vincular."
                style={{ marginBottom: space.md }}
              />
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon={<Users size={30} color={colors.primary} strokeWidth={1.8} />} title={search ? "Nada encontrado" : "Ninguém aqui"} description={search ? "Nenhum funcionário corresponde à busca." : filter === "active" ? "Toque em + para cadastrar o primeiro funcionário." : undefined} actionLabel={!search && filter === "active" ? "Novo funcionário" : undefined} onAction={() => setCreating(true)} />}
          renderItem={({ item }) => (
            <ListRow
              icon={<User size={22} color={colors.primary} strokeWidth={1.8} />}
              title={item.name}
              subtitle={[item.code ? `#${item.code}` : null, item.jobTitle, item.phone].filter(Boolean).join(" · ") || null}
              trailing={
                item.status !== "active" || item.archivedAt ? (
                  <Pill label={item.archivedAt ? "Arquivado" : EMPLOYEE_STATUS[item.status].label} tone={item.archivedAt ? "neutral" : EMPLOYEE_STATUS[item.status].tone} />
                ) : !item.userId ? (
                  <Pill label="Sem usuário" dot={false} />
                ) : undefined
              }
              onPress={() => open(item._id)}
            />
          )}
        />
      )}
      <EmployeeFormSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => open(id)} />
    </View>
  );
}
