import { useClerk } from "@clerk/expo";
import type { Doc } from "@rlpapp/backend/convex/_generated/dataModel";
import Constants from "expo-constants";
import { useRouter, type Href } from "expo-router";
import {
  Bell,
  Building2,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  History,
  LogOut,
  Package,
  ShieldCheck,
  Trash2,
  Warehouse,
} from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, ConfirmDialog, ScreenHeader, Surface, screenStyles } from "@/components/ui";
import { LINKS, openUrl } from "@/lib/links";
import { hasBell } from "@/lib/notifications";
import { listPendingPunches } from "@/lib/punch-queue";
import { PROFILE_LABEL, type Profile } from "@/lib/profile";
import { colors, space, type } from "@/lib/theme";
import { usePendingCount } from "@/lib/use-pending-records";

type Row = { key: string; title: string; subtitle?: string; icon: React.ReactNode; onPress: () => void; external?: boolean; danger?: boolean };

function Group({ title, rows }: { title?: string; rows: Row[] }) {
  return (
    <View style={{ gap: 6 }}>
      {title ? <Text style={[type.eyebrow, styles.groupTitle]}>{title}</Text> : null}
      <Surface padded={false}>
        {rows.map((r, i) => (
          <Pressable
            key={r.key}
            onPress={r.onPress}
            accessibilityRole={r.external ? "link" : "button"}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfacePressed }]}
          >
            {r.icon}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { color: r.danger ? colors.destructive : colors.text, fontWeight: "500" }]}>{r.title}</Text>
              {r.subtitle ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{r.subtitle}</Text> : null}
            </View>
            {r.external ? <ExternalLink size={18} color={colors.icon} /> : r.danger ? null : <ChevronRight size={20} color={colors.icon} />}
          </Pressable>
        ))}
      </Surface>
    </View>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Aba Mais (ficha S10) e Conta do cliente (L5). */
export function MaisScreen({ user, profile }: { user: Doc<"users">; profile: Profile }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const pendingRecords = usePendingCount();
  const [confirm, setConfirm] = useState<null | { pending: number }>(null);
  const [leaving, setLeaving] = useState(false);
  const ic = (Icon: typeof Bell, color: string = colors.text) => <Icon size={20} color={color} strokeWidth={2} />;

  const outras: Row[] = [];
  if (profile === "engenharia" || profile === "compras") {
    outras.push({ key: "estoque", title: "Estoque", subtitle: "Saldos, movimentações e pedidos (consulta)", icon: ic(Warehouse), onPress: () => router.push("/(tabs)/estoque") });
  }
  if (profile === "engenharia") {
    outras.push({
      key: "materiais",
      title: "Materiais e preços",
      subtitle: "Materiais, fornecedores e preços (consulta)",
      icon: ic(Package),
      onPress: () => router.push("/(tabs)/compras/materiais" as Href),
    });
  }

  const campo: Row[] =
    profile === "tecnico"
      ? [
          { key: "outras", title: "Outras obras", subtitle: "Obras em que você não está escalado", icon: ic(Building2), onPress: () => router.push("/campo/outras-obras" as Href) },
          { key: "registros", title: "Meus registros", subtitle: "Instalações e manutenções enviadas", icon: ic(History), onPress: () => router.push("/campo/meus-registros" as Href) },
        ]
      : [];

  async function askSignOut() {
    const punches = await listPendingPunches(user.clerkId).catch(() => []);
    setConfirm({ pending: pendingRecords + punches.length });
  }

  async function doSignOut() {
    setLeaving(true);
    try {
      await signOut();
      router.replace("/");
    } finally {
      setLeaving(false);
      setConfirm(null);
    }
  }

  const version = Constants.expoConfig?.version;
  const name = user.name ?? user.username ?? "";

  return (
    <ScrollView contentContainerStyle={[screenStyles.content, { gap: space.lg }]}>
      <ScreenHeader title={profile === "cliente" ? "Sua conta" : "Mais"} large style={{ paddingHorizontal: 0 }} />
      <Surface style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name) || "?"}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.subtitle, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
            {PROFILE_LABEL[profile]}
          </Text>
          {user.username ? <Text style={[type.caption, { color: colors.textSecondary }]}>@{user.username}</Text> : null}
        </View>
      </Surface>
      {outras.length ? <Group title="Outras áreas" rows={outras} /> : null}
      {campo.length ? <Group title="Campo" rows={campo} /> : null}
      {hasBell(profile) ? (
        <Group
          title="Notificações"
          rows={[
            {
              key: "notificacoes",
              title: "Notificações",
              subtitle: "O que avisa no celular e horário silencioso",
              icon: ic(Bell),
              onPress: () => router.push("/notificacoes/preferencias" as Href),
            },
          ]}
        />
      ) : null}
      <Group
        title="Ajuda"
        rows={[
          { key: "suporte", title: "Suporte", subtitle: "Fale com a RLP Engenharia", icon: ic(HelpCircle), onPress: () => openUrl(LINKS.support), external: true },
          { key: "privacidade", title: "Política de privacidade", icon: ic(ShieldCheck), onPress: () => openUrl(LINKS.privacy), external: true },
        ]}
      />
      <Group
        title="Conta"
        rows={[{ key: "excluir", title: "Excluir conta", subtitle: "Pedido atendido em até 15 dias", icon: ic(Trash2, colors.destructive), onPress: () => openUrl(LINKS.deleteAccount), danger: true }]}
      />
      <AppButton label="Sair" variant="secondary" block icon={<LogOut size={18} color={colors.text} />} onPress={() => void askSignOut()} />
      {version ? <Text style={[type.caption, styles.version]}>RLP Engenharia · versão {version}</Text> : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm && confirm.pending > 0 ? `Sair com ${confirm.pending} ${confirm.pending === 1 ? "item" : "itens"} na fila?` : "Sair da conta?"}
        description={
          confirm && confirm.pending > 0
            ? "Eles ainda não foram enviados. Se sair agora, ficam guardados neste aparelho e só vão quando você entrar de novo com internet."
            : "Você vai precisar entrar de novo com usuário e senha."
        }
        confirmLabel="Sair"
        destructive
        busy={leaving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void doSignOut()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  groupTitle: { color: colors.text, paddingHorizontal: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontWeight: "600", color: colors.primary },
  version: { color: colors.textSecondaryOnBg, textAlign: "center" },
});
