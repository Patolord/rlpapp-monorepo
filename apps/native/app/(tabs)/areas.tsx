import { useRouter, type Href } from "expo-router";
import { Building2, ClipboardList, Home, ShoppingCart, UserCheck, Users, Warehouse } from "lucide-react-native";
import React from "react";
import { ScrollView } from "react-native";

import { Divider, ListRow, Screen, ScreenHeader, SectionTitle, Surface, screenStyles } from "@/components/ui";
import { colors } from "@/lib/theme";

const ic = (Icon: typeof Building2) => <Icon size={20} color={colors.primary} strokeWidth={2} />;
const flat = { borderWidth: 0, borderRadius: 0, shadowOpacity: 0, elevation: 0 } as const;

/** Áreas da diretoria (ficha S9): cada linha abre a área correspondente. */
export default function AreasScreen() {
  const router = useRouter();
  const rows: { title: string; subtitle: string; href: Href; icon: React.ReactNode }[] = [
    { title: "Engenharia", subtitle: "Equipamentos, etiquetas, contratos e cadastros", href: "/(tabs)/engenharia", icon: ic(ClipboardList) },
    { title: "Compras", subtitle: "Materiais, fornecedores, preços e revisão", href: "/(tabs)/compras", icon: ic(ShoppingCart) },
    { title: "Estoque", subtitle: "Central, movimentações e pedidos das obras", href: "/(tabs)/estoque", icon: ic(Warehouse) },
    { title: "Recursos Humanos", subtitle: "Funcionários, folha e ponto da equipe", href: "/(tabs)/rh", icon: ic(Users) },
    { title: "Portal do cliente", subtitle: "Ver as obras como o cliente vê", href: "/(tabs)/portal", icon: ic(Home) },
  ];
  return (
    <Screen>
      <ScrollView contentContainerStyle={[screenStyles.content, { gap: 8 }]}>
        <ScreenHeader title="Áreas" large style={{ paddingHorizontal: 0 }} />
        <Surface padded={false}>
          {rows.map((r, i) => (
            <React.Fragment key={r.title}>
              {i > 0 ? <Divider inset={68} /> : null}
              <ListRow icon={r.icon} title={r.title} subtitle={r.subtitle} onPress={() => router.push(r.href)} style={flat} />
            </React.Fragment>
          ))}
        </Surface>
        <SectionTitle title="Administração" style={{ paddingHorizontal: 2 }} />
        <Surface padded={false}>
          <ListRow icon={ic(UserCheck)} title="Usuários" subtitle="Criar, editar e desativar acessos" onPress={() => router.push("/(tabs)/engenharia/usuarios" as Href)} style={flat} />
        </Surface>
      </ScrollView>
    </Screen>
  );
}
