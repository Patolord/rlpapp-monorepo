import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Users } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { Chips, EmptyState, LoadingState, SearchField, Surface, Toggle, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space } from "@/lib/theme";

type Filter = "batem" | "todas";

/** Quem bate ponto pelo app: libera ou retira a marcação de cada usuário ativo. */
export default function PessoasPontoScreen() {
  const toast = useToast();
  const people = useQuery(api.timeClock.listClockPeople, {});
  const setClocksIn = useMutation(api.timeClock.setClocksIn);
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<Id<"users"> | null>(null);

  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (people ?? [])
      .filter((p) => filter === "todas" || p.clocksIn)
      .filter((p) => !term || [p.name, p.login].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [people, filter, search]);

  async function toggle(userId: Id<"users">, enabled: boolean) {
    setSavingId(userId);
    try {
      await setClocksIn({ userId, enabled });
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSavingId(null);
    }
  }

  if (people === undefined) return <LoadingState />;
  const clocking = people.filter((p) => p.clocksIn).length;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Nome ou login" />
        <Chips<Filter>
          items={[
            { key: "todas", label: "Todas" },
            { key: "batem", label: "Batem ponto", count: clocking },
          ]}
          active={filter}
          onChange={setFilter}
          style={{ paddingHorizontal: 0 }}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.userId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Surface>
            <Toggle
              label={item.name}
              description={item.login ?? undefined}
              value={item.clocksIn}
              disabled={savingId === item.userId}
              onChange={(next) => void toggle(item.userId, next)}
            />
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={28} color={colors.primary} />}
            title={filter === "batem" && !search ? "Ninguém bate ponto pelo app" : "Nenhuma pessoa encontrada"}
            description={filter === "batem" && !search ? "Libere a marcação em Todas." : "Confira a busca."}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.lg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
});
