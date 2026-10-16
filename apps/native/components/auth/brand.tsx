import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Line, Rect, Stop } from "react-native-svg";

// ---------------------------------------------------------------------------
// Brand palette for the auth / launch screens (pinned to the reference design)
// ---------------------------------------------------------------------------
export const BRAND = {
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
  track: "#E3EAF5",
  logo: "#1E2A78",
  logoLight: "#DCEBFA",
  logoText: "#1B2461",
};

export type BrandPalette = typeof BRAND;

// ---------------------------------------------------------------------------
// Decorative background: soft gradient + faint diagonal "technical" lines
// in the upper-right, echoing the reference image.
// ---------------------------------------------------------------------------
export function Backdrop({ width, height, c }: { width: number; height: number; c: BrandPalette }) {
  const lines = [
    [width * 0.55, 0, width, height * 0.3],
    [width * 0.7, 0, width, height * 0.18],
    [width * 0.4, 0, width, height * 0.42],
    [width * 0.85, 0, width, height * 0.09],
    [width * 0.6, height * 0.2, width, height * 0.5],
    [0, height * 0.55, width * 0.35, height],
    [0, height * 0.72, width * 0.2, height],
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
