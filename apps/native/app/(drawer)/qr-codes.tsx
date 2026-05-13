import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react";
import {
  ArrowLeft,
  Lock,
  QrCode,
  Copy,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { useRouter, Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function generateToken(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function QRCodesScreen() {
  return (
    <Container className="px-5 pt-4 pb-24">
      <Authenticated>
        <QRCodesContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">
            Acesso Restrito
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Faça login para acessar
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4">
              <ButtonText>Entrar</ButtonText>
            </Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </AuthLoading>
    </Container>
  );
}

function QRCodesContent() {
  const router = useRouter();
  const batchCreate = useMutation(api.qrCodes.batchCreate);

  const [batchName, setBatchName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdTokens, setCreatedTokens] = useState<string[]>([]);

  const handleGenerate = async () => {
    const name = batchName.trim();
    if (!name) {
      Alert.alert("Erro", "Informe o nome do lote.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 999) {
      Alert.alert("Erro", "Quantidade deve ser entre 1 e 999.");
      return;
    }

    const normalizedPrefix = prefix.trim().toUpperCase();
    const tokens: string[] = [];
    for (let i = 0; i < qty; i++) {
      tokens.push(
        normalizedPrefix
          ? `${normalizedPrefix}-${generateToken(6)}`
          : generateToken(8)
      );
    }

    setIsGenerating(true);
    try {
      const result = await batchCreate({ tokens, batchName: name });
      const created = result.created.map((c: { token: string }) => c.token);
      setCreatedTokens(created);
      Alert.alert("Sucesso", `${created.length} QR Code(s) gerado(s).`);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Erro ao gerar QR Codes");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await Share.share({ message: token });
    } catch {}
  };

  const handleShareAll = async () => {
    if (createdTokens.length === 0) return;
    try {
      await Share.share({ message: createdTokens.join("\n") });
    } catch {}
  };

  const handleNewBatch = () => {
    setBatchName("");
    setPrefix("");
    setQuantity("10");
    setCreatedTokens([]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft size={22} color="#6d5efc" />
        </Pressable>
        <View>
          <Text className="text-2xl font-bold text-foreground">
            Gerar QR Codes
          </Text>
          <Text className="text-muted-foreground text-sm">
            Crie um lote de QR Codes
          </Text>
        </View>
      </View>

      {createdTokens.length === 0 ? (
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <QrCode size={20} color="#6d5efc" />
              <CardTitle>Novo Lote</CardTitle>
            </View>
            <CardDescription>
              Configure e gere um lote de QR Codes
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="gap-1">
              <Label>Nome do lote</Label>
              <Input
                value={batchName}
                onChangeText={setBatchName}
                placeholder="Ex: Lote Obra Centro - Maio"
              />
            </View>
            <View className="gap-1">
              <Label>Prefixo (opcional)</Label>
              <Input
                value={prefix}
                onChangeText={(t) => setPrefix(t.toUpperCase())}
                placeholder="Ex: RLP"
                autoCapitalize="characters"
              />
              <Text className="text-xs text-muted-foreground mt-0.5">
                Se informado, os códigos terão formato PREFIXO-XXXXXX
              </Text>
            </View>
            <View className="gap-1">
              <Label>Quantidade (1-999)</Label>
              <Input
                value={quantity}
                onChangeText={setQuantity}
                placeholder="10"
                keyboardType="numeric"
              />
            </View>
            <Button onPress={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ButtonText>Gerar QR Codes</ButtonText>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <View className="gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Lote Gerado</CardTitle>
              <CardDescription>
                {createdTokens.length} código(s) criado(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-2">
              <View className="flex-row gap-2 mb-2">
                <Button
                  variant="outline"
                  onPress={handleShareAll}
                  className="flex-1"
                >
                  <ButtonText variant="outline">Compartilhar todos</ButtonText>
                </Button>
                <Button onPress={handleNewBatch} className="flex-1">
                  <ButtonText>Novo lote</ButtonText>
                </Button>
              </View>
              {createdTokens.map((token) => (
                <Pressable
                  key={token}
                  onPress={() => handleCopyToken(token)}
                  className="flex-row items-center justify-between rounded-lg border border-border p-3"
                >
                  <Text
                    className="text-foreground text-sm flex-1"
                    style={{ fontFamily: "monospace" }}
                  >
                    {token}
                  </Text>
                  <Copy size={14} color="#9ca3af" />
                </Pressable>
              ))}
            </CardContent>
          </Card>
        </View>
      )}
    </View>
  );
}
