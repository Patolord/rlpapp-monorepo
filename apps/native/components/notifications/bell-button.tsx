import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Bell } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconButton } from "@/components/ui";
import { badgeLabel } from "@/lib/notifications";
import { colors } from "@/lib/theme";

/** Sino do topo do Início (técnico: topo de Obras), com o número de não lidas. */
export function BellButton({ tone = "surface" }: { tone?: "surface" | "ghost" }) {
  const router = useRouter();
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const label = unread > 0 ? `Notificações, ${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Notificações";
  return (
    <View>
      <IconButton
        tone={tone}
        label={label}
        icon={<Bell size={20} color={colors.text} strokeWidth={2} />}
        onPress={() => router.push("/notificacoes" as Href)}
      />
      {unread > 0 ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel(unread)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.destructive,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, lineHeight: 13, fontWeight: "700" },
});
