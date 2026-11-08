import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter, type Href } from "expo-router";
import { BellOff, Settings } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { Chips, EmptyState, IconButton, LoadingState, Surface, useToast } from "@/components/ui";
import {
  CATEGORY_META,
  UNAVAILABLE_HREF,
  groupByDay,
  hrefForNotification,
  timeLabel,
  type NotificationCategory,
} from "@/lib/notifications";
import { useProfile } from "@/lib/profile";
import { colors, radius, space, type } from "@/lib/theme";

type Row = FunctionReturnType<typeof api.notifications.listMine>[number];
type Filter = "todas" | "nao_lidas";

/** Central de notificações (ficha S13). */
export default function CentralScreen() {
  const router = useRouter();
  const toast = useToast();
  const me = useProfile();
  const [filter, setFilter] = useState<Filter>("todas");
  const rows = useQuery(api.notifications.listMine, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [now] = useState(() => Date.now());

  const unread = rows?.filter((r) => r.readAt === null).length ?? 0;
  const visible = useMemo(
    () => (rows ?? []).filter((r) => filter === "todas" || r.readAt === null),
    [rows, filter]
  );
  const sections = useMemo(() => groupByDay(visible, now), [visible, now]);

  async function open(row: Row) {
    if (row.readAt === null) void markRead({ notificationId: row._id }).catch(() => undefined);
    const href = me ? hrefForNotification(row.target, row.params, me.profile) : null;
    router.push(href ?? UNAVAILABLE_HREF);
  }

  async function readAll() {
    try {
      const n = await markAllRead({});
      toast.success(n === 1 ? "1 aviso marcado como lido" : `${n} avisos marcados como lidos`);
    } catch {
      toast.error("Não deu para marcar. Tente de novo.");
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              tone="ghost"
              label="Preferências de notificação"
              icon={<Settings size={20} color={colors.text} />}
              onPress={() => router.push("/notificacoes/preferencias" as Href)}
            />
          ),
        }}
      />
      {rows === undefined ? (
        <LoadingState />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={styles.toolbar}>
              <Chips<Filter>
                items={[
                  { key: "todas", label: "Todas" },
                  { key: "nao_lidas", label: "Não lidas", count: unread },
                ]}
                active={filter}
                onChange={setFilter}
                style={{ paddingHorizontal: 0 }}
              />
              {unread > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => void readAll()} hitSlop={8}>
                  <Text style={styles.readAll}>Marcar como lidas</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item, index, section }) => (
            <NotificationRow
              row={item}
              now={now}
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={() => void open(item)}
            />
          )}
          ListEmptyComponent={
            filter === "nao_lidas" && (rows?.length ?? 0) > 0 ? (
              <EmptyState title="Tudo lido" description="Nenhum aviso esperando por você." actionLabel="Ver todas" onAction={() => setFilter("todas")} />
            ) : (
              <EmptyState
                icon={<BellOff size={28} color={colors.primary} />}
                title="Nenhum aviso por aqui"
                description="Quando algo pedir sua atenção (um pedido, uma aprovação, um documento novo), aparece aqui. Os avisos ficam por 60 dias."
              />
            )
          }
        />
      )}
    </View>
  );
}

function NotificationRow({
  row,
  now,
  first,
  last,
  onPress,
}: {
  row: Row;
  now: number;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const meta = CATEGORY_META[row.category as NotificationCategory] ?? CATEGORY_META.andamento;
  const Icon = meta.icon;
  const isUnread = row.readAt === null;
  return (
    <Surface
      padded={false}
      onPress={onPress}
      accessibilityLabel={`${isUnread ? "Não lida. " : ""}${row.title}. ${row.body}`}
      style={[styles.card, !first && styles.joinTop, !last && styles.joinBottom]}
    >
      <View style={styles.row}>
        <View style={styles.tile}>
          <Icon size={20} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleLine}>
            <Text style={[isUnread ? type.bodyStrong : type.body, styles.title]} numberOfLines={2}>
              {row.title}
            </Text>
            <Text style={styles.time}>{timeLabel(row.createdAt, now)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={3}>
            {row.body}
          </Text>
        </View>
        {isUnread ? <View style={styles.dot} accessibilityElementsHidden /> : <View style={styles.dotSpacer} />}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.screen, paddingBottom: 48 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.sm },
  readAll: { ...type.label, color: colors.primary, fontWeight: "600" },
  section: { ...type.eyebrow, color: colors.textSecondaryOnBg, marginTop: space.lg, marginBottom: space.sm },
  card: { borderRadius: radius.md },
  joinTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 },
  joinBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.md, minHeight: 72 },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { flex: 1, color: colors.text },
  time: { ...type.caption, color: colors.textSecondary, paddingTop: 3 },
  body: { ...type.bodySm, color: colors.textSecondary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  dotSpacer: { width: 10 },
});
