import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  Building2,
  FileText,
  History,
  Keyboard,
  Package,
  QrCode,
  ScanLine,
  ShieldAlert,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState, LoadingState } from "@rlpapp/ui/native";
import { BigAction, BigTile } from "@/components/campo/field-ui";
import { obraSubtitle, obraTitle, useFieldObra } from "@/components/campo/obra";
import { PendingBanner } from "@/components/campo/pending-banner";
import { AppButton } from "@/components/ui";
import { setLastFieldObra } from "@/lib/field-cache";
import { normalizeTypedToken } from "@/lib/qr-token";
import { colors, radius, space, type } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

const TILE_ICON = { size: 40, color: colors.primary, strokeWidth: 1.9 } as const;

/** Hub da obra: Escanear em destaque e quatro blocos grandes. */
export default function ObraHubScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const online = useOnline();
  const obra = useFieldObra(projectId);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");

  // Estoque exige atribuição à obra (a query lança "acesso negado" para quem
  // só está de passagem), então só roda com `assigned`.
  const assignedId = obra != null && obra.assigned ? obra._id : null;
  const balances = useQuery(
    api.inventoryRequests.listObraBalances,
    assignedId ? { projectId: assignedId } : "skip"
  );
  const depleted = balances?.filter((b) => b.quantity <= 0).length ?? 0;

  useEffect(() => {
    if (obra) void setLastFieldObra(obra._id);
  }, [obra]);

  function go(pathname: `/campo/obra/[projectId]/${string}`) {
    router.push({ pathname, params: { projectId: projectId! } } as Href);
  }

  function openToken(token: string) {
    router.push({
      pathname: "/campo/obra/[projectId]/equipamento/[token]",
      params: { projectId: projectId!, token },
    });
  }

  function handleTypedCode() {
    const token = normalizeTypedToken(code);
    if (!token) return;
    setCode("");
    setTyping(false);
    openToken(token);
  }

  if (obra === undefined) {
    return (
      <>
        <Stack.Screen options={{ title: "Obra" }} />
        {online ? (
          <LoadingState label="Carregando obra…" />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.centeredText}>Sem internet. Conecte para abrir esta obra.</Text>
          </View>
        )}
      </>
    );
  }

  if (obra === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Obra" }} />
        <View style={styles.centered}>
          <EmptyState
            icon={<Building2 size={28} color={colors.primary} />}
            title="Obra não encontrada"
            description="Ela foi arquivada ou não existe mais."
            action={
              <AppButton
                variant="secondary"
                label="Voltar"
                onPress={() => router.replace("/campo" as Href)}
              />
            }
          />
        </View>
      </>
    );
  }

  const client = obraSubtitle(obra);

  return (
    <>
      <Stack.Screen
        options={{
          title: obraTitle(obra),
          headerTitle: () => (
            <View>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {obraTitle(obra)}
              </Text>
              {client ? (
                <Text style={styles.headerClient} numberOfLines={1}>
                  {client}
                </Text>
              ) : null}
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!obra.assigned ? (
          <View style={styles.notAssigned}>
            <ShieldAlert size={24} color={colors.info} />
            <Text style={styles.notAssignedText}>Você não está nesta obra</Text>
          </View>
        ) : null}

        <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />

        <BigAction
          size="hero"
          label="Escanear"
          icon={<ScanLine size={64} color={colors.onPrimary} strokeWidth={1.8} />}
          onPress={() => go("/campo/obra/[projectId]/scanner")}
        />

        {typing ? (
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="Código da etiqueta"
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={handleTypedCode}
              accessibilityLabel="Código da etiqueta"
            />
            <BigAction
              size="md"
              label="Abrir"
              disabled={!code.trim()}
              onPress={handleTypedCode}
            />
          </View>
        ) : (
          <BigAction
            size="md"
            variant="secondary"
            label="Digitar código"
            icon={<Keyboard size={24} color={colors.text} strokeWidth={2.2} />}
            onPress={() => setTyping(true)}
          />
        )}

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <BigTile
              label="Equipamentos"
              icon={<QrCode {...TILE_ICON} />}
              onPress={() => go("/campo/obra/[projectId]/etiquetas")}
            />
            {obra.assigned ? (
              <BigTile
                label="Estoque"
                icon={<Package {...TILE_ICON} />}
                badge={depleted}
                onPress={() => go("/campo/obra/[projectId]/estoque")}
              />
            ) : (
              <BigTile
                label="Meus registros"
                icon={<History {...TILE_ICON} />}
                onPress={() => go("/campo/obra/[projectId]/registros")}
              />
            )}
          </View>
          {/* Documentos e estoque exigem atribuição à obra. */}
          {obra.assigned ? (
            <View style={styles.gridRow}>
              <BigTile
                label="Documentos"
                icon={<FileText {...TILE_ICON} />}
                onPress={() => go("/campo/obra/[projectId]/documentos")}
              />
              <BigTile
                label="Meus registros"
                icon={<History {...TILE_ICON} />}
                onPress={() => go("/campo/obra/[projectId]/registros")}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48, gap: space.lg },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  centeredText: { ...type.body, textAlign: "center", color: colors.textSecondary },
  headerTitle: { fontSize: 19, lineHeight: 24, fontWeight: "700", color: colors.text },
  headerClient: { fontSize: 14, lineHeight: 18, fontWeight: "500", color: colors.textSecondary },
  notAssigned: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
  notAssignedText: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.text },
  codeRow: { flexDirection: "row", gap: space.sm },
  codeInput: {
    flex: 1,
    height: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: colors.text,
  },
  grid: { gap: space.md, paddingTop: space.xs },
  gridRow: { flexDirection: "row", gap: space.md },
});
