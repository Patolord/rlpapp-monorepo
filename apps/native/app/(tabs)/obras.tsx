import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2, Plus, Warehouse } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { ProjectFormSheet } from "@/components/engenharia/project-form-sheet";
import { ObraProgress } from "@/components/inicio/parts";
import {
  Chips,
  EmptyState,
  IconButton,
  ListRow,
  LoadingState,
  Screen,
  ScreenHeader,
  SearchField,
  screenStyles,
} from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { colors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Aba Obras (A3 §2): o que cada perfil pode ler no backend.
// - Engenharia e diretoria: todas as obras com andamento; abrem com as abas.
// - Compras: nomes das obras; abrem no Orçamento.
// - Estoque: obras com movimento de estoque; abrem no Estoque da obra.
// ---------------------------------------------------------------------------
export default function ObrasScreen() {
  const me = useProfile();
  if (!me) return <LoadingScreen />;
  if (me.profile === "estoque") return <StockObras />;
  if (me.profile === "compras") return <PurchasingObras />;
  return <EngineeringObras canCreate={me.profile === "engenharia" || me.profile === "diretoria"} />;
}

const STATUS_FILTERS = [
  { key: "in_progress", label: "Em andamento" },
  { key: "planning", label: "Planejamento" },
  { key: "paused", label: "Pausadas" },
  { key: "completed", label: "Concluídas" },
  { key: "all", label: "Todas" },
] as const;
type StatusKey = (typeof STATUS_FILTERS)[number]["key"];

function matches(term: string, ...values: (string | null | undefined)[]) {
  const t = term.trim().toLocaleLowerCase("pt-BR");
  if (!t) return true;
  return values.some((v) => v?.toLocaleLowerCase("pt-BR").includes(t));
}

function EngineeringObras({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const projects = useQuery(api.projects.list, {});
  const [filter, setFilter] = useState<StatusKey>("in_progress");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(
    () =>
      (projects ?? []).filter(
        (p) => !p.archivedAt && (filter === "all" || p.status === filter) && matches(search, p.name, p.customerName, p.address)
      ),
    [projects, filter, search]
  );

  return (
    <Screen>
      <ScreenHeader
        title="Obras"
        subtitle="Acompanhe o avanço prédio por prédio"
        large
        right={
          canCreate ? (
            <IconButton label="Nova obra" tone="primary" onPress={() => setCreating(true)} icon={<Plus size={20} color={colors.onPrimary} />} />
          ) : undefined
        }
      />
      <View style={styles.filters}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar obra ou cliente" containerStyle={styles.search} />
        <Chips items={STATUS_FILTERS.map((f) => ({ key: f.key, label: f.label }))} active={filter} onChange={setFilter} />
      </View>
      {projects === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p._id}
          contentContainerStyle={screenStyles.content}
          ListEmptyComponent={
            <EmptyState
              icon={<Building2 size={24} color={colors.primary} />}
              title={search || filter !== "all" ? "Nada com estes filtros" : "Nenhuma obra cadastrada"}
              description={search || filter !== "all" ? "Tente outra busca ou veja todas." : "Toque em + para criar a primeira obra."}
            />
          }
          renderItem={({ item }) => (
            <ObraProgress
              name={item.name}
              installed={item.installedItems}
              total={item.totalItems}
              onPress={() => router.push({ pathname: "/obra/[projectId]", params: { projectId: item._id } })}
            />
          )}
        />
      )}
      {canCreate ? <ProjectFormSheet open={creating} onClose={() => setCreating(false)} /> : null}
    </Screen>
  );
}

function PurchasingObras() {
  const router = useRouter();
  const projects = useQuery(api.inventory.listProjects);
  const [search, setSearch] = useState("");
  const visible = (projects ?? []).filter((p) => matches(search, p.name));
  return (
    <Screen>
      <ScreenHeader title="Obras" subtitle="Orçamento e estoque de cada obra" large />
      <View style={styles.filters}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar obra" containerStyle={styles.search} />
      </View>
      {projects === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p._id}
          contentContainerStyle={screenStyles.content}
          ListEmptyComponent={<EmptyState title="Nenhuma obra encontrada" />}
          renderItem={({ item }) => (
            <ListRow
              icon={<Building2 size={20} color={colors.primary} />}
              title={item.name}
              subtitle="Orçamento e estoque"
              onPress={() => router.push({ pathname: "/obra/[projectId]/orcamento", params: { projectId: item._id } })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function StockObras() {
  const router = useRouter();
  const summaries = useQuery(api.inventory.listProjectSummaries);
  const [search, setSearch] = useState("");
  const visible = (summaries ?? []).filter((p) => matches(search, p.projectName));
  return (
    <Screen>
      <ScreenHeader title="Obras" subtitle="Estoque por obra" large />
      <View style={styles.filters}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar obra" containerStyle={styles.search} />
      </View>
      {summaries === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.projectId}
          contentContainerStyle={screenStyles.content}
          ListEmptyComponent={
            <EmptyState
              icon={<Warehouse size={24} color={colors.primary} />}
              title="Nenhuma obra com estoque"
              description="Quando sair material para uma obra, ela aparece aqui."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              icon={<Building2 size={20} color={colors.primary} />}
              title={item.projectName}
              subtitle={`${item.materialCount} materiais · ${item.transferCount} envios · ${item.consumptionCount} consumos`}
              onPress={() => router.push({ pathname: "/obra/[projectId]/estoque", params: { projectId: item.projectId } })}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 10, paddingBottom: 12 },
  search: { marginHorizontal: 16 },
});
