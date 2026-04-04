import { useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import * as React from "react";
import { Alert, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert("Erro", err?.errors?.[0]?.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({ code });
      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/");
      } else {
        console.error(JSON.stringify(signUpAttempt, null, 2));
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.errors?.[0]?.message || "Código inválido");
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <View className="flex-1 bg-background justify-center px-6" style={{ paddingTop: insets.top }}>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Verificar Email</CardTitle>
            <CardDescription className="text-center">
              Insira o código de verificação enviado para {emailAddress}
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
                />
              </View>
              <Button onPress={onVerifyPress} disabled={loading} className="mt-2">
                <ButtonText>{loading ? "Verificando..." : "Verificar"}</ButtonText>
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
          <CardTitle className="text-2xl text-center">Criar Conta</CardTitle>
          <CardDescription className="text-center">
            Crie sua conta para começar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <View className="gap-4">
            <View className="gap-1.5">
              <Label>Email</Label>
              <Input
                autoCapitalize="none"
                keyboardType="email-address"
                value={emailAddress}
                placeholder="seu@email.com"
                onChangeText={setEmailAddress}
              />
            </View>
            <View className="gap-1.5">
              <Label>Senha</Label>
              <Input
                value={password}
                placeholder="Crie uma senha"
                secureTextEntry
                onChangeText={setPassword}
              />
            </View>
            <Button onPress={onSignUpPress} disabled={loading} className="mt-2">
              <ButtonText>{loading ? "Criando..." : "Continuar"}</ButtonText>
            </Button>
          </View>
        </CardContent>
        <CardFooter className="justify-center">
          <Text className="text-muted-foreground text-sm">Já tem uma conta? </Text>
          <Link href="/sign-in">
            <Text className="text-primary text-sm font-medium">Entrar</Text>
          </Link>
        </CardFooter>
      </Card>
    </View>
  );
}
