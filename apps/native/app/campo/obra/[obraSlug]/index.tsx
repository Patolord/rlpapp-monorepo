import { useRouter, type Href } from "expo-router";
import { FileText, History, MapPin, Package, QrCode } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { OBRA_STATUS_LABELS, obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { ListRow, Pill, Screen, ScreenHeader, SectionTitle } from "@/components/ui";
import { plural } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

/** Hub da obra para o técnico: documentos, etiquetas, estoque e registros. */
export default function CampoObraHubScreen() {
  const router = useRouter();
  const { obra, obraSlug } = useFieldObra();
  const base = `/campo/obra/${obraSlug}`;

  return (
    <Screen>
      <ScreenHeader title={obraTitle(obra)} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OfflineBanner detail="Documentos salvos continuam disponíveis." />

        {(obra.client || obra.address || obra.status) && (
          <View style={styles.summary}>
            {obra.client ? (
              <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
                {obra.client}
              </Text>
            ) : null}
            {obra.address ? (
              <View style={styles.address}>
                <MapPin size={14} color={colors.textMuted} />
                <Text style={[type.bodySm, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                  {obra.address}
                </Text>
              </View>
            ) : null}
            {obra.status ? (
              <Pill
                label={OBRA_STATUS_LABELS[obra.status] ?? obra.status}
                tone={obra.status === "in_progress" ? "info" : obra.status === "completed" ? "success" : "neutral"}
              />
            ) : null}
          </View>
        )}

        <SectionTitle title="Nesta obra" style={styles.section} />
        <ListRow
          icon={<FileText size={22} color={colors.primary} strokeWidth={1.8} />}
          title="Documentos"
          subtitle="PDFs liberados pela engenharia para esta obra."
          meta={plural(obra.documentCount, "PDF")}
          onPress={() => router.push(`${base}/documentos` as Href)}
        />
        <ListRow
          icon={<QrCode size={22} color={colors.primary} strokeWidth={1.8} />}
          title="Etiquetas QR"
          subtitle="Equipamentos cadastrados e etiquetas livres."
          meta={`${obra.registeredCount}/${obra.qrCount}`}
          onPress={() => router.push(`${base}/etiquetas` as Href)}
        />
        <ListRow
          icon={<Package size={22} color={colors.primary} strokeWidth={1.8} />}
          title="Estoque"
          subtitle="Saldo de materiais e pedidos da obra."
          onPress={() => router.push(`${base}/estoque` as Href)}
        />

        <SectionTitle title="Seus registros" style={styles.section} />
        <ListRow
          icon={<History size={22} color={colors.textSecondary} strokeWidth={1.8} />}
          iconTone="neutral"
          title="Meus registros"
          subtitle="Serviços e fotos enviados por você, inclusive os pendentes."
          onPress={() => router.push("/meus-registros?action=history" as Href)}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.screen,
    paddingBottom: space.xxl * 2,
    gap: space.md,
  },
  summary: { gap: space.sm, paddingHorizontal: 4 },
  address: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  section: { paddingHorizontal: 0, paddingTop: space.md },
});
