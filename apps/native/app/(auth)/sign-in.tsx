// Entry "legacy": keeps the useSignIn setActive/status API used by this flow
// (the default @clerk/expo export uses the Core 3 signals API).
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter } from "expo-router";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, User } from "lucide-react-native";
import React from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Line, Rect, Stop } from "react-native-svg";

import { RlpLogo } from "@/components/auth/rlp-logo";
import { getClerkErrorMessage } from "@/lib/errors";
import { getClerkLoginErrorMessage, normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";

// ---------------------------------------------------------------------------
// Palette (login screen is pinned to the reference design)
// ---------------------------------------------------------------------------
const LIGHT = {
  bg: "#F6F9FD",
  bgTint: "#DCE8F7",
  line: "#C7D7EE",
  title: "#1B2A5E",
  subtitle: "#4A5A8A",
  label: "#3C4A6E",
  inputBg: "#FFFFFF",
  inputBorder: "#D6DEEC",
  inputBorderFocus: "#3B82E0",
  inputText: "#1B2A5E",
  placeholder: "#8A96B0",
  icon: "#6B7A99",
  button: "#3B82E0",
  buttonText: "#FFFFFF",
  footer: "#4A5A8A",
  logo: "#1E2A78",
  logoLight: "#DCEBFA",
  logoText: "#1B2461",
};


// ---------------------------------------------------------------------------
// Decorative background: soft gradient + faint diagonal "technical" lines
// in the upper-right, echoing the reference image.
// ---------------------------------------------------------------------------
function Backdrop({ width, height, c }: { width: number; height: number; c: typeof LIGHT }) {
  const lines = [
    [width * 0.55, 0, width, height * 0.3],
    [width * 0.7, 0, width, height * 0.18],
    [width * 0.4, 0, width, height * 0.42],
    [width * 0.85, 0, width, height * 0.09],
    [width * 0.6, height * 0.2, width, height * 0.5],
  ];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.bg} />
          <Stop offset="0.55" stopColor={c.bg} />
          <Stop offset="1" stopColor={c.bgTint} />
        </LinearGradient>
        <LinearGradient id="glow" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.bgTint} stopOpacity="0.9" />
          <Stop offset="0.5" stopColor={c.bgTint} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#bg)" />
      <Rect x="0" y="0" width={width} height={height * 0.6} fill="url(#glow)" />
      {lines.map(([x1, y1, x2, y2], i) => (
        <Line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={c.line}
          strokeWidth={i % 2 === 0 ? 1.2 : 0.8}
          strokeOpacity={0.6}
        />
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Input with floating label on the border, leading icon and optional trailing
// slot (used for the password visibility toggle).
// ---------------------------------------------------------------------------
type FieldProps = TextInputProps & {
  label: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  c: typeof LIGHT;
};

function Field({ label, icon, trailing, c, style, onFocus, onBlur, ...props }: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: c.inputBg,
          borderColor: focused ? c.inputBorderFocus : c.inputBorder,
        },
      ]}
    >
      <View style={[styles.fieldLabelWrap, { backgroundColor: c.inputBg }]}>
        <Text style={[styles.fieldLabel, { color: focused ? c.inputBorderFocus : c.label }]}>{label}</Text>
      </View>
      <View style={styles.fieldIcon}>{icon}</View>
      <TextInput
        {...props}
        style={[styles.fieldInput, { color: c.inputText }, style]}
        placeholderTextColor={c.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
      {trailing ? <View style={styles.fieldTrailing}>{trailing}</View> : null}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  c,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  c: typeof LIGHT;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.button, opacity: disabled ? 0.6 : pressed ? 0.9 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: c.buttonText }]}>{label}</Text>
      <ArrowRight size={26} color={c.buttonText} strokeWidth={2.2} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const c = LIGHT;

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
                c={c}
                label="Código"
                icon={<KeyRound size={26} color={c.icon} strokeWidth={1.6} />}
                placeholder="123456"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                autoFocus
              />
              <PrimaryButton
                c={c}
                label={loading ? "Verificando..." : "Verificar"}
                onPress={onVerifyCode}
                disabled={loading}
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
                c={c}
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
                c={c}
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
              <PrimaryButton
                c={c}
                label={loading ? "Entrando..." : "Entrar"}
                onPress={onSignInPress}
                disabled={loading}
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
  field: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 16,
  },
  fieldLabelWrap: {
    position: "absolute",
    top: -10,
    left: 14,
    paddingHorizontal: 4,
  },
  fieldLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  fieldIcon: {
    width: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  fieldInput: {
    flex: 1,
    height: "100%",
    fontSize: 18,
    paddingVertical: 0,
  },
  fieldTrailing: {
    marginLeft: 8,
  },
  button: {
    height: 58,
    borderRadius: 16,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  buttonText: {
    fontSize: 22,
    fontWeight: "500",
  },
  footer: {
    marginTop: 36,
    fontSize: 15,
    textAlign: "center",
  },
});
