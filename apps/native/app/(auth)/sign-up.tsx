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

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signUp.create({ username, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Erro", "Não foi possível completar o cadastro. Tente novamente.");
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.errors?.[0]?.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

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
