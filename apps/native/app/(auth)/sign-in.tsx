import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [needsSecondFactor, setNeedsSecondFactor] = React.useState(false);
  const [code, setCode] = React.useState("");

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const signInAttempt = await signIn.create({
        identifier: username,
        password,
      });
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else if (signInAttempt.status === "needs_second_factor") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsSecondFactor(true);
      } else {
        Alert.alert("Erro", "Status inesperado. Tente novamente.");
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.errors?.[0]?.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Erro", "Não foi possível verificar. Tente novamente.");
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.errors?.[0]?.message || "Código inválido");
    } finally {
      setLoading(false);
    }
  };

  if (needsSecondFactor) {
    return (
      <View className="flex-1 bg-background justify-center px-6" style={{ paddingTop: insets.top }}>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Verificação</CardTitle>
            <CardDescription className="text-center">
              Insira o código enviado para seu email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-4">
              <View className="gap-1.5">
                <Label>Código de verificação</Label>
                <Input
                  value={code}
                  placeholder="123456"
                  keyboardType="number-pad"
                  onChangeText={setCode}
                  autoFocus
                />
              </View>
              <Button onPress={onVerifyCode} disabled={loading} className="mt-2">
                <ButtonText>{loading ? "Verificando..." : "Verificar"}</ButtonText>
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setNeedsSecondFactor(false);
                  setCode("");
                }}
              >
                <ButtonText variant="ghost">Voltar</ButtonText>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background justify-center px-6" style={{ paddingTop: insets.top }}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Entrar</CardTitle>
          <CardDescription className="text-center">
            Faça login na sua conta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <View className="gap-4">
            <View className="gap-1.5">
              <Label>Usuário</Label>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                placeholder="seu.usuario"
                onChangeText={setUsername}
              />
            </View>
            <View className="gap-1.5">
              <Label>Senha</Label>
              <Input
                value={password}
                placeholder="Sua senha"
                secureTextEntry
                onChangeText={setPassword}
              />
            </View>
            <Button onPress={onSignInPress} disabled={loading} className="mt-2">
              <ButtonText>{loading ? "Entrando..." : "Continuar"}</ButtonText>
            </Button>
          </View>
        </CardContent>
        <CardFooter className="justify-center">
          <Text className="text-muted-foreground text-sm text-center">
            Não tem acesso? Fale com o administrador.
          </Text>
        </CardFooter>
      </Card>
    </View>
  );
}
