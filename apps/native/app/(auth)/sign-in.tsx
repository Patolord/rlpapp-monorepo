// Entry "legacy": keeps the useSignIn setActive/status API used by this flow
// (the default @clerk/expo export uses the Core 3 signals API).
import { useClerk } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter } from "expo-router";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, User } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop, BRAND } from "@/components/auth/brand";
import { RlpLogo } from "@/components/auth/rlp-logo";
import { AppButton, Field } from "@/components/ui";
import { getClerkErrorMessage } from "@/lib/errors";
import {
  findExistingClerkSessionId,
  getClerkLoginErrorMessage,
  normalizeUsername,
  sanitizeUsernameInput,
} from "@rlpapp/shared";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const clerk = useClerk();
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
  const [error, setError] = React.useState<string | null>(null);

  const onSignInPress = async () => {
    // O "go" do teclado chama esta função direto, sem passar pelo botão desabilitado.
    if (!isLoaded || loading) return;
    setError(null);
    if (!username.trim() || !password) {
      setError("Preencha usuário e senha.");
      return;
    }
    setLoading(true);
    const identifier = normalizeUsername(username);
    try {
      const signInAttempt = await signIn.create({ identifier, password });
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else if (signInAttempt.status === "needs_second_factor") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsSecondFactor(true);
      } else {
        setError("Não deu para entrar agora. Tente de novo.");
      }
    } catch (err) {
      // "Already signed in": recupera a sessão que já existe em vez de falhar.
      const existingSession = await findExistingClerkSessionId(err, clerk.client, identifier);
      try {
        if (!existingSession) throw err;
        await setActive({ session: existingSession });
        router.replace("/");
      } catch (finalErr) {
        setError(getClerkLoginErrorMessage(finalErr, "Erro ao fazer login"));
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError("Não foi possível verificar. Tente de novo.");
      }
    } catch (err) {
      setError(getClerkErrorMessage(err, "Código inválido"));
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
          <RlpLogo size={120} color={c.logo} lightColor={c.logoLight} textColor={c.logoText} />
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
                icon={<KeyRound size={18} color={c.icon} strokeWidth={2} />}
                placeholder="123456"
                keyboardType="number-pad"
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setError(null);
                }}
                error={error ?? undefined}
                autoFocus
              />
              <AppButton
                size="lg"
                label="Verificar"
                loadingLabel="Verificando…"
                onPress={onVerifyCode}
                loading={loading}
                block
                style={styles.button}
              />
            </View>

            <Pressable
              onPress={() => {
                setNeedsSecondFactor(false);
                setCode("");
                setError(null);
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
                icon={<User size={18} color={c.icon} strokeWidth={2} />}
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
                icon={<Lock size={18} color={c.icon} strokeWidth={2} />}
                placeholder="Senha"
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setError(null);
                }}
                error={error ?? undefined}
                returnKeyType="go"
                onSubmitEditing={onSignInPress}
                trailing={
                  <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12}>
                    {showPassword ? (
                      <EyeOff size={18} color={c.icon} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={c.icon} strokeWidth={2} />
                    )}
                  </Pressable>
                }
              />
              <AppButton
                size="lg"
                label="Entrar"
                loadingLabel="Entrando…"
                trailing={<ArrowRight size={18} color={c.buttonText} strokeWidth={2} />}
                onPress={onSignInPress}
                loading={loading}
                block
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
    paddingHorizontal: 16,
    alignItems: "stretch",
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  form: {
    marginTop: 24,
    gap: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  button: {
    marginTop: 4,
  },
  footer: {
    marginTop: 28,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
