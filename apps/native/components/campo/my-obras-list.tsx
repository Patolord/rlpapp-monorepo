import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAuth } from "@clerk/expo";
import { useRouter, type Href } from "expo-router";
import { Building2, FileText, HardHat, QrCode } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { OBRA_STATUS_LABELS, obraLinkSlug } from "@/components/campo/obra-context";
import { EmptyState, LoadingState, Pill, Surface } from "@/components/ui";
import { plural } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";
import { useCachedQuery } from "@/lib/use-cached-query";

/** Obras atribuídas ao técnico (staff vê todas). */
export function MyObrasList() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: projects, fromCache, cacheChecked } = useCachedQuery(
    userId ? `my-projects:${userId}` : null,
    api.technicianPortal.listMyProjects
  );

  if (projects === undefined) {
    if (!cacheChecked) return null;
    return <LoadingState message="Carregando suas obras..." style={{ flex: 0, paddingVertical: space.xxl }} />;
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<HardHat size={30} color={colors.primary} strokeWidth={1.8} />}
        title="Nenhuma obra atribuída"
        description="Peça à engenharia para liberar o acesso às suas obras."
      />
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {fromCache ? (
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Lista salva neste aparelho — pode estar desatualizada.
        </Text>
      ) : null}
      {projects.map((project) => {
        const subtitle = [project.client, project.address].filter(Boolean).join(" · ");
        return (
          <Surface
            key={project._id}
            onPress={() => router.push(`/campo/obra/${obraLinkSlug(project)}` as Href)}
            style={styles.card}
          >
            <View style={styles.top}>
              <View style={styles.icon}>
                <Building2 size={22} color={colors.primary} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {project.legacyNumber ? `#${project.legacyNumber} · ` : ""}
                  {project.name}
                </Text>
                {subtitle ? (
                  <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.meta}>
              {project.status ? (
                <Pill
                  label={OBRA_STATUS_LABELS[project.status] ?? project.status}
                  tone={project.status === "in_progress" ? "info" : project.status === "completed" ? "success" : "neutral"}
                />
              ) : null}
              <View style={styles.metaItem}>
                <FileText size={14} color={colors.textMuted} />
                <Text style={[type.caption, { color: colors.textMuted }]}>{plural(project.documentCount, "PDF")}</Text>
              </View>
              <View style={styles.metaItem}>
                <QrCode size={14} color={colors.textMuted} />
                <Text style={[type.caption, { color: colors.textMuted }]}>{plural(project.qrCount, "etiqueta")}</Text>
              </View>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
