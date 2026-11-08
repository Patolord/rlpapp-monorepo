import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Briefcase, FileText, Fan, History, QrCode, Ruler, UserCheck, Users } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Divider, ListRow, Pill, ScreenHeader, SectionTitle, Surface, screenStyles } from "@/components/ui";
import { isAdmin, useProfile } from "@/lib/profile";
import { colors } from "@/lib/theme";

type Item = { href: Href; title: string; subtitle: string; icon: React.ReactNode; trailing?: React.ReactNode };

function Group({ title, items, note }: { title: string; items: Item[]; note?: string }) {
  const router = useRouter();
  return (
    <View>
      <SectionTitle title={title} style={styles.section} />
      <Surface padded={false}>
        {items.map((item, i) => (
          <React.Fragment key={item.title}>
            {i > 0 ? <Divider inset={68} /> : null}
            <ListRow
              icon={item.icon}
              title={item.title}
              subtitle={item.subtitle}
              trailing={item.trailing}
              onPress={() => router.push(item.href)}
              style={styles.row}
            />
          </React.Fragment>
        ))}
      </Surface>
      {note ? <SectionTitle title={note} style={styles.note} /> : null}
    </View>
  );
}

/** Menu da área Engenharia (B6, ficha G1). */
export default function EngenhariaMenuScreen() {
  const me = useProfile();
  const equipment = useQuery(api.equipment.list);
  const errors = equipment?.filter((e) => e.status === "error").length ?? 0;
  const ic = (Icon: typeof Fan) => <Icon size={20} color={colors.primary} strokeWidth={2} />;

  return (
    <ScrollView contentContainerStyle={[screenStyles.content, { gap: 4 }]}>
      <ScreenHeader title="Engenharia" subtitle="Equipamentos, etiquetas, contratos e cadastros" large style={styles.header} />
      <Group
        title="Campo"
        items={[
          {
            href: "/(tabs)/engenharia/equipamentos",
            title: "Equipamentos",
            subtitle: equipment ? `${equipment.length} cadastrados pelas etiquetas` : "Cadastrados pelas etiquetas",
            icon: ic(Fan),
            trailing: errors > 0 ? <Pill label={`${errors} com erro`} tone="danger" /> : undefined,
          },
          { href: "/(tabs)/engenharia/qr-codes", title: "Etiquetas QR", subtitle: "Lotes, gerar novos e códigos livres", icon: ic(QrCode) },
          { href: "/(tabs)/engenharia/registro", title: "Meus registros", subtitle: "O que foi registrado em campo", icon: ic(History) },
        ]}
      />
      <Group
        title="Contratos"
        items={[
          { href: "/(tabs)/engenharia/contratos", title: "Contratos", subtitle: "Vendas ao cliente e empreiteiros", icon: ic(FileText) },
          { href: "/(tabs)/engenharia/medicoes", title: "Medições", subtitle: "Faturamento por obra", icon: ic(Ruler) },
        ]}
      />
      <Group
        title="Cadastros"
        items={[
          { href: "/(tabs)/engenharia/clientes", title: "Clientes", subtitle: "Com contatos", icon: ic(Users) },
          { href: "/(tabs)/engenharia/empreiteiros", title: "Empreiteiros", subtitle: "Com contatos", icon: ic(Briefcase) },
        ]}
      />
      {isAdmin(me?.user) ? (
        <Group
          title="Equipe"
          items={[{ href: "/(tabs)/engenharia/usuarios", title: "Usuários", subtitle: "Criar, editar e desativar acessos", icon: ic(UserCheck) }]}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 0 },
  section: { paddingHorizontal: 2 },
  note: { paddingHorizontal: 2, paddingTop: 6 },
  row: { borderWidth: 0, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
});
