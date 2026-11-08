import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Cpu, ScanLine } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { StatusBadge } from "@/components/engenharia/status-badge";
import { AppButton, Chips, EmptyState, LoadingState, MetricStrip, SearchField, Surface } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from "@/lib/equipment-status";
import { formatDateTime } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

type Filter = "todos" | EquipmentStatus;

/** Equipamentos cadastrados em campo (ficha G2), com status e busca. */
export default function EquipamentosScreen() {
  const router = useRouter();
  const list = useQuery(api.equipment.list);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (list ?? [])
      .filter((e) => filter === "todos" || e.status === filter)
      .filter((e) => !term || [e.description, e.tag, e.location].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [list, filter, search]);

  if (list === undefined) return <LoadingState message="Carregando equipamentos…" />;
  const count = (s: EquipmentStatus) => list.filter((e) => e.status === s).length;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={visible}
      keyExtractor={(e) => e._id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <MetricStrip
            items={[
              { label: "Cadastrados", value: list.length },
              { label: "Operacionais", value: count("operational") },
              { label: "Atenção", value: count("warning") },
              { label: "Erro", value: count("error") },
            ]}
          />
          <AppButton label="Escanear etiqueta" variant="secondary" block icon={<ScanLine size={18} color={colors.text} />} onPress={() => router.push("/scanner")} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Descrição ou local" />
          <Chips<Filter>
            active={filter}
            onChange={setFilter}
            style={{ paddingHorizontal: 0 }}
            items={[{ key: "todos", label: "Todos" }, ...(Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((s) => ({ key: s, label: EQUIPMENT_STATUS_LABELS[s], count: count(s) }))]}
          />
        </View>
      }
      renderItem={({ item }) => (
        <Surface onPress={() => router.push(`/equipamento-eng/${item._id}` as Href)} accessibilityLabel={item.description ?? "Equipamento"}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                {item.description || "Equipamento sem descrição"}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>Cadastrado {formatDateTime(item.createdAt)}</Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
        </Surface>
      )}
      ListEmptyComponent={<EmptyState icon={<Cpu size={28} color={colors.primary} />} title={search || filter !== "todos" ? "Nada com estes filtros" : "Nenhum equipamento cadastrado"} description={search || filter !== "todos" ? undefined : "Os equipamentos cadastrados pelos técnicos em campo aparecem aqui."} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  header: { gap: space.md, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
});
