import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Link2, Users } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton, Chips, EmptyState, LoadingState, Pill, PickerField, SearchField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

type Person = FunctionReturnType<typeof api.timeClock.listRhidPeople>[number];
type Filter = "sem" | "todas";

/** Pessoas do RHID (ficha R13): vincular cada pessoa a um funcionário. */
export default function PessoasRhidScreen() {
  const toast = useToast();
  const people = useQuery(api.timeClock.listRhidPeople, {});
  const employees = useQuery(api.employees.list, {});
  const linkPerson = useMutation(api.timeClock.linkPerson);
  const [filter, setFilter] = useState<Filter>("sem");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Person | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (people ?? [])
      .filter((p) => p.active)
      .filter((p) => filter === "todas" || !p.employee)
      .filter((p) => !term || [p.name, p.department, p.employee?.name].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [people, filter, search]);

  const options = useMemo(
    () => (employees ?? []).filter((e) => !e.archivedAt).map((e) => ({ value: e._id as string, label: e.name, description: e.jobTitle ?? null })),
    [employees]
  );

  async function save(value: string | null) {
    if (!editing) return;
    setSaving(true);
    try {
      await linkPerson({ rhidPersonId: editing.rhidPersonId, employeeId: value as Id<"employees"> | null });
      toast.success(value ? "Pessoa vinculada" : "Vínculo removido");
      setEditing(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  if (people === undefined) return <LoadingState />;
  const unlinked = people.filter((p) => p.active && !p.employee).length;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Nome ou departamento" />
        <Chips<Filter>
          items={[
            { key: "sem", label: "Sem vínculo", count: unlinked },
            { key: "todas", label: "Todas" },
          ]}
          active={filter}
          onChange={setFilter}
          style={{ paddingHorizontal: 0 }}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => String(p.rhidPersonId)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Surface
            onPress={() => {
              setEditing(item);
              setEmployeeId(item.employee?._id ?? null);
            }}
            accessibilityLabel={`${item.name}, ${item.employee ? `vinculada a ${item.employee.name}` : "sem vínculo"}`}
          >
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.department, item.employee ? `Funcionário: ${item.employee.name}` : null].filter(Boolean).join(" · ") || "Sem departamento"}
                </Text>
              </View>
              {item.employee ? <Pill label="Vinculada" tone="success" /> : <Pill label="Sem vínculo" tone="warning" />}
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={28} color={colors.primary} />}
            title={filter === "sem" ? "Todas as pessoas estão vinculadas" : "Nenhuma pessoa encontrada"}
            description={filter === "sem" ? "Quando o RHID trouxer alguém novo, aparece aqui para vincular." : "Confira a busca."}
          />
        }
      />

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        subtitle={editing?.department ?? undefined}
        footer={
          <View style={{ gap: space.sm }}>
            <AppButton label="Salvar vínculo" block icon={<Link2 size={18} color={colors.onPrimary} />} disabled={!employeeId || employeeId === editing?.employee?._id} loading={saving} onPress={() => void save(employeeId)} />
            {editing?.employee ? <AppButton label="Remover vínculo" variant="danger" block disabled={saving} onPress={() => void save(null)} /> : null}
          </View>
        }
      >
        <PickerField label="Funcionário" value={employeeId} options={options} onChange={setEmployeeId} searchable placeholder="Escolha o funcionário" loading={employees === undefined} />
        <Text style={[type.bodySm, { color: colors.textSecondary, marginTop: space.sm }]}>
          As marcações desta pessoa no RHID passam a contar para o funcionário escolhido.
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.lg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
