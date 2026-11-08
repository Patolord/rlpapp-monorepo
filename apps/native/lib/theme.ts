import type { TextStyle, ViewStyle } from "react-native";

// ---------------------------------------------------------------------------
// Tokens do app native, com os valores do "RLP App Design System" (o mesmo do
// web: apps/web/src/index.css e packages/ui/src/tokens) em escala de celular.
// Os nomes antigos continuam valendo para as telas que ainda não migraram.
// Use estes tokens (nunca hex solto) em telas e componentes.
// Referência: claude/rlpapp-native-redesign.md §8.
// ---------------------------------------------------------------------------

/** Cores de status do design system: só para o ponto do StatusBadge e ícones. */
export const status = {
  neutral: "#6E7279",
  info: "#3E6DC8",
  success: "#0E9254",
  warning: "#D98B09",
  danger: "#CC2827",
  muted: "#ACAEB1",
} as const;

export const colors = {
  // Fundo
  bg: "#F4F5F8",
  bgTint: "#EEF0F4",
  // Superfícies
  surface: "#FFFFFF",
  surfaceMuted: "#F5F5F5",
  surfacePressed: "#F5F5F5",
  border: "#E5E5E5",
  borderStrong: "#D5D7DB",
  controlBorder: "#D5D7DB",
  controlDisabled: "#EEEEEE",
  controlDisabledText: "#808080",
  divider: "#E5E5E5",
  // Texto
  text: "#0A0A0A",
  /** Secundário sobre cartão (4,7:1). */
  textSecondary: "#737373",
  /** Secundário direto sobre o fundo cinza (5,7:1); o #737373 dá 4,3:1 ali. */
  textSecondaryOnBg: "#5F6168",
  textMuted: "#737373",
  label: "#0A0A0A",
  icon: "#737373",
  // Marca
  primary: "#2855AD",
  primaryPressed: "#1A469D",
  primarySoft: "#DFECFF",
  onPrimary: "#FAFAFA",
  /** Só a logo. */
  navy: "#2B3990",
  logoSky: "#DCEEFA",
  destructive: "#B7191C",
  // Tons semânticos para texto e ícone (passam 4,5:1 sobre branco)
  success: "#00713E",
  successSoft: "#E7F6EF",
  warning: "#8F5B00",
  warningSoft: "#FDF3E1",
  danger: "#B7191C",
  dangerSoft: "#FCE9E9",
  info: "#2855AD",
  infoSoft: "#DFECFF",
  // Outros
  track: "#E5E5E5",
  overlay: "rgba(10, 10, 10, 0.45)",
  focus: "#2855AD",
  toast: "#0A0A0A",
} as const;

export const radius = {
  /** Botão e campo. */
  sm: 6,
  /** Cartão. */
  md: 12,
  /** Topo do Sheet. */
  lg: 18,
  /** Menus e opções. */
  menu: 8,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** Margem lateral da tela. */
  screen: 16,
} as const;

export const control = {
  /** Campos e botões padrão (48, o "xl · campo" do design system). */
  heightLg: 48,
  height: 48,
  /** Botão compacto dentro de cartão. */
  heightSm: 40,
  /** Botão só de ícone. */
  icon: 44,
  /** Altura mínima de linha de lista. */
  row: 56,
} as const;

export const type = {
  /** Título das telas raiz e saudação do Início. */
  display: { fontSize: 26, lineHeight: 32, fontWeight: "600", letterSpacing: -0.3 },
  /** Título de tela interna e de Sheet. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.2 },
  /** Título de cartão e de seção grande. */
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600", letterSpacing: -0.1 },
  /** Título de linha de lista. */
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  /** Rótulo de seção (antes era caixa alta; o design system usa frase normal). */
  eyebrow: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  xs: {
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#101828",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const satisfies Record<string, ViewStyle>;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Por tom: `bg` (fundo suave de ícone), `fg` (texto e ícone que passam 4,5:1)
 * e `dot` (cor de status do design system, só para ponto e ícone de estado).
 */
export const tone: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, dot: status.neutral },
  info: { bg: colors.infoSoft, fg: colors.info, dot: status.info },
  success: { bg: colors.successSoft, fg: colors.success, dot: status.success },
  warning: { bg: colors.warningSoft, fg: colors.warning, dot: status.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger, dot: status.danger },
};

export const theme = { colors, status, radius, space, control, type, shadow, tone } as const;
export type Theme = typeof theme;
