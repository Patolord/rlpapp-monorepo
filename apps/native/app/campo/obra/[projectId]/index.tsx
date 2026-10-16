import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  Building2,
  ChevronRight,
  History,
  QrCode,
  ScanLine,
  Search,
  ShieldAlert,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Badge, EmptyState, LoadingState } from "@rlpapp/ui/native";
import {
  OBRA_STATUS_LABELS,
  obraSubtitle,
  obraTitle,
  useFieldObra,
} from "@/components/campo/obra";
import { PendingBanner } from "@/components/campo/pending-banner";
import { Button, ButtonText } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/lib/use-online";
import { normalizeTypedToken } from "@/lib/qr-token";

/** Hub da obra: escanear ou digitar a etiqueta, ver etiquetas e registros. */
export default function ObraHubScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const online = useOnline();
  const obra = useFieldObra(projectId);
  const [code, setCode] = useState("");

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
    openToken(token);
  }

  if (obra === undefined) {
    return (
      <>
        <Stack.Screen options={{ title: "Obra" }} />
        {online ? (
          <LoadingState label="Carregando obra…" />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-sm text-muted-foreground">
              Sem conexão. Conecte-se à internet para abrir esta obra.
            </Text>
          </View>
        )}
      </>
    );
  }

  if (obra === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Obra" }} />
        <View className="flex-1 justify-center px-5">
          <EmptyState
            icon={<Building2 size={28} color="#d97706" />}
            title="Obra não encontrada"
            description="Esta obra não existe mais ou foi arquivada."
            action={
              <Button variant="outline" onPress={() => router.replace("/campo" as Href)}>
                <ButtonText variant="outline">Voltar para minhas obras</ButtonText>
              </Button>
            }
          />
        </View>
      </>
    );
  }

  const subtitle = obraSubtitle(obra);
  const statusLabel = obra.status ? (OBRA_STATUS_LABELS[obra.status] ?? obra.status) : null;

  return (
    <>
      <Stack.Screen options={{ title: obra.name }} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!obra.assigned ? (
          <View className="flex-row items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3">
            <ShieldAlert size={18} color="#2563eb" />
            <Text className="flex-1 text-sm text-blue-900">
              Você não está atribuído a esta obra. Pode registrar mesmo assim;
              avise a engenharia se for ficar nela.
            </Text>
          </View>
        ) : null}

        <PendingBanner onPress={() => router.push("/campo/pendentes" as Href)} />

        {/* Resumo */}
        <Card className="gap-2 p-5">
          <Text className="text-xl font-bold text-foreground">{obraTitle(obra)}</Text>
          {subtitle ? (
            <Text className="text-sm text-muted-foreground">{subtitle}</Text>
          ) : null}
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            {statusLabel ? <Badge variant="neutral">{statusLabel}</Badge> : null}
            <Badge variant="info">
              {`${obra.registeredCount}/${obra.qrCount} etiquetas cadastradas`}
            </Badge>
          </View>
        </Card>

        {/* Ação principal */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/campo/obra/[projectId]/scanner",
              params: { projectId: projectId! },
            })
          }
          accessibilityRole="button"
        >
          <View className="flex-row items-center gap-4 rounded-2xl bg-primary p-5">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
              <ScanLine size={30} color="#ffffff" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-bold text-primary-foreground">
                Escanear etiqueta
              </Text>
              <Text className="text-xs text-primary-foreground/80">
                Abre a câmera para ler o QR do equipamento
              </Text>
            </View>
            <ChevronRight size={22} color="#ffffff" />
          </View>
        </Pressable>

        {/* Código manual */}
        <Card className="gap-3 p-4">
          <Text className="text-sm font-semibold text-foreground">
            Etiqueta sem leitura? Digite o código
          </Text>
          <View className="flex-row gap-2">
            <Input
              className="h-12 flex-1 font-mono text-base"
              placeholder="Ex: LORENAH4FC29"
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleTypedCode}
            />
            <Button className="h-12 px-4" disabled={!code.trim()} onPress={handleTypedCode}>
              <Search size={18} color="#fafafa" />
              <ButtonText className="ml-1">Abrir</ButtonText>
            </Button>
          </View>
        </Card>

        {/* Navegação da obra */}
        <View className="gap-2">
          <HubTile
            icon={<QrCode size={22} color="#d97706" />}
            iconBg="bg-amber-100"
            title="Etiquetas da obra"
            description="Equipamentos cadastrados e etiquetas livres."
            onPress={() =>
              router.push({
                pathname: "/campo/obra/[projectId]/etiquetas",
                params: { projectId: projectId! },
              })
            }
          />
          <HubTile
            icon={<History size={22} color="#10b981" />}
            iconBg="bg-green-100"
            title="Meus registros nesta obra"
            description="Serviços e cadastros que você enviou."
            onPress={() =>
              router.push({
                pathname: "/campo/obra/[projectId]/registros",
                params: { projectId: projectId! },
              })
            }
          />
        </View>
      </ScrollView>
    </>
  );
}

function HubTile({
  icon,
  iconBg,
  title,
  description,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card className="flex-row items-center gap-4 p-4">
        <View className={`h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-foreground">{title}</Text>
          <Text className="text-xs text-muted-foreground">{description}</Text>
        </View>
        <ChevronRight size={18} color="#9ca3af" />
      </Card>
    </Pressable>
  );
}
