// Entry "legacy": keeps the useSignIn setActive/status API used by this flow
// (the default @clerk/expo export uses the Core 3 signals API).
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter } from "expo-router";
import { Eye, EyeOff, KeyRound, Lock, User } from "lucide-react-native";
import React from "react";
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop, BRAND } from "@/components/auth/brand";
import { RlpLogo } from "@/components/auth/rlp-logo";
import { AppButton, Field } from "@/components/ui";
import { getClerkErrorMessage } from "@/lib/errors";
import { getClerkLoginErrorMessage, normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const c = BRAND;

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [needsSecondFactor, setNeedsSecondFactor] = React.useState(false);
  const [code, setCode] = React.useState("");

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const signInAttempt = await signIn.create({
        identifier: normalizeUsername(username),
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
    } catch (err) {
      Alert.alert("Erro", getClerkLoginErrorMessage(err, "Erro ao fazer login"));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Erro", "Não foi possível verificar. Tente novamente.");
      }
    } catch (err) {
      Alert.alert("Erro", getClerkErrorMessage(err, "Código inválido"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Backdrop width={width} height={height} c={c} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <RlpLogo size={160} color={c.logo} lightColor={c.logoLight} textColor={c.logoText} />
        </View>

        {needsSecondFactor ? (
          <>
            <Text style={[styles.title, { color: c.title }]}>Verificação</Text>
            <Text style={[styles.subtitle, { color: c.subtitle }]}>
              Insira o código enviado para seu e-mail.
            </Text>

            <View style={styles.form}>
              <Field
                label="Código"
                icon={<KeyRound size={26} color={c.icon} strokeWidth={1.6} />}
                placeholder="123456"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                autoFocus
              />
              <AppButton
                size="lg"
                label={loading ? "Verificando..." : "Verificar"}
                onPress={onVerifyCode}
                loading={loading}
                style={styles.button}
              />
            </View>

            <Pressable
              onPress={() => {
                setNeedsSecondFactor(false);
                setCode("");
              }}
              hitSlop={12}
            >
              <Text style={[styles.footer, { color: c.footer }]}>Voltar para o login</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: c.title }]}>Bem-vindo de volta</Text>
            <Text style={[styles.subtitle, { color: c.subtitle }]}>
              Entre com suas credenciais para continuar.
            </Text>

            <View style={styles.form}>
              <Field
                label="Usuário"
                icon={<User size={26} color={c.icon} strokeWidth={1.6} />}
                placeholder="Nome"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                value={username}
                onChangeText={(v) => setUsername(sanitizeUsernameInput(v))}
                returnKeyType="next"
              />
              <Field
                label="Senha"
                icon={<Lock size={26} color={c.icon} strokeWidth={1.6} />}
                placeholder="Senha"
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={onSignInPress}
                trailing={
                  <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12}>
                    {showPassword ? (
                      <EyeOff size={26} color={c.icon} strokeWidth={1.6} />
                    ) : (
                      <Eye size={26} color={c.icon} strokeWidth={1.6} />
                    )}
                  </Pressable>
                }
              />
              <AppButton
                size="lg"
                label={loading ? "Entrando..." : "Entrar"}
                onPress={onSignInPress}
                loading={loading}
                style={styles.button}
              />
            </View>

            <Text style={[styles.footer, { color: c.footer }]}>
              Não tem acesso? Fale com o administrador.
            </Text>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: "stretch",
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "500",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 22,
    textAlign: "center",
  },
  form: {
    marginTop: 28,
    gap: 20,
  },
  button: {
    marginTop: 10,
  },
  footer: {
    marginTop: 36,
    fontSize: 15,
    textAlign: "center",
  },
});
