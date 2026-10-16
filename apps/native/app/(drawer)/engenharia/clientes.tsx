import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Building2, User, Users } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import {
  EmptyState,
  ListRow,
  LoadingState,
  Pill,
  ScreenHeader,
  SearchField,
  screenStyles,
} from "@/components/ui";
import { colors, space } from "@/lib/theme";

export default function ClientesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const customers = useQuery(api.customers.list, {
    search: search.trim() || undefined,
  });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Clientes"
        subtitle={
          customers === undefined
            ? "Gestão de clientes e contatos"
            : `${customers.length} ${customers.length === 1 ? "cliente" : "clientes"}`
        }
        onBack={() => router.back()}
      />

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar por nome, razão social ou CNPJ"
        containerStyle={{ marginHorizontal: space.screen, marginBottom: space.lg }}
      />

      {customers === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={screenStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={30} color={colors.primary} strokeWidth={1.8} />}
              title={search ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
              description={
                search
                  ? "Nenhum cliente corresponde à busca."
                  : "Os clientes aparecerão aqui quando forem cadastrados."
              }
            />
          }
          renderItem={({ item }) => {
            const isCompany = item.personType === "pj";
            const Icon = isCompany ? Building2 : User;
            const subtitle = [item.legalName && item.legalName !== item.name ? item.legalName : null, item.email, item.phone]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListRow
                icon={<Icon size={22} color={colors.primary} strokeWidth={1.8} />}
                title={item.name}
                subtitle={subtitle || null}
                trailing={!item.active ? <Pill label="Inativo" tone="warning" /> : undefined}
              />
            );
          }}
        />
      )}
    </View>
  );
}
