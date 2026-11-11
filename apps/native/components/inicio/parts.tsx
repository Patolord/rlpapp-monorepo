import { ChevronRight, Clock } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenHeader, Surface } from "@/components/ui";
import { colors, radius, shadow, space, type } from "@/lib/theme";

export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function dateLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

/** Saudação do Início: "Bom dia, Ana" + área e data. */
export function HomeHeader({ name, area, right }: { name?: string | null; area?: string; right?: React.ReactNode }) {
  const now = new Date();
  const first = name?.split(" ")[0];
  const date = dateLabel(now);
  return (
    <ScreenHeader
      title={`${greetingFor(now)}${first ? `, ${first}` : ""}`}
      subtitle={area ? `${area} · ${date}` : date.charAt(0).toUpperCase() + date.slice(1)}
      right={right}
      large
      style={styles.header}
    />
  );
}

/** Linha "Precisa de você": ícone, título, detalhe e o número. */
export function NeedRow({
  icon,
  title,
  subtitle,
  count,
  onPress,
  first,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  onPress?: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${title}, ${count}` : title}
      style={({ pressed }) => [styles.need, !first && styles.needBorder, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      <View style={styles.tile}>{icon}</View>
      <View style={styles.needText}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {count !== undefined ? (
        <View style={styles.count}>
          <Text style={[type.label, { color: colors.text, fontWeight: "600" }]}>{count}</Text>
        </View>
      ) : null}
      <ChevronRight size={20} color={colors.icon} />
    </Pressable>
  );
}

export function NeedList({ children }: { children: React.ReactNode }) {
  return <Surface padded={false}>{children}</Surface>;
}

/** Atalho grande azul (escanear, marcar ponto). Um por tela. */
export function HeroAction({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.hero, { backgroundColor: pressed ? colors.primaryPressed : colors.primary }]}
    >
      <View style={styles.heroIcon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.heading, { color: colors.onPrimary }]}>{title}</Text>
        <Text style={[type.bodySm, { color: "#E8EEFA" }]}>{subtitle}</Text>
      </View>
      <ChevronRight size={22} color={colors.onPrimary} />
    </Pressable>
  );
}

export function PontoHero({ onPress }: { onPress: () => void }) {
  return (
    <HeroAction
      icon={<Clock size={26} color={colors.onPrimary} />}
      title="Marcar ponto"
      subtitle="Entrada, almoço e saída"
      onPress={onPress}
    />
  );
}

/** Obra com barra de andamento. */
export function ObraProgress({
  name,
  installed,
  total,
  late,
  onPress,
}: {
  name: string;
  installed: number;
  total: number;
  late?: boolean;
  onPress?: () => void;
}) {
  const pct = total > 0 ? Math.round((installed / total) * 100) : 0;
  return (
    <Surface onPress={onPress} style={{ gap: 8 }} accessibilityLabel={`${name}, ${pct}%`}>
      <View style={styles.obraHead}>
        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.bodyStrong, { color: colors.text }]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 100 ? colors.success : colors.primary }]} />
      </View>
      <View style={styles.obraHead}>
        <Text style={[type.bodySm, { color: colors.textSecondary, flex: 1 }]}>
          {installed} de {total} instalados
        </Text>
        {late ? <Text style={[type.caption, { color: colors.warning }]}>Em atraso</Text> : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 0 },
  need: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
  },
  needBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  needText: { flex: 1, gap: 2, minWidth: 0 },
  count: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: space.lg,
    borderRadius: radius.md,
    ...shadow.xs,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "rgba(250,250,250,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  obraHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
