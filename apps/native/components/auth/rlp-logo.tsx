import { View, Text } from "react-native";
import Svg, { Defs, ClipPath, Polygon, Rect, LinearGradient, Stop, G } from "react-native-svg";

type Props = {
  /** Width of the diamond mark, in px. */
  size?: number;
  color?: string;
  lightColor?: string;
  textColor?: string;
};

/**
 * RLP Engenharia brand mark: a diamond filled with diagonal stripes,
 * with a soft light sweep across the lower-left, plus the wordmark below.
 */
export function RlpLogo({
  size = 160,
  color = "#1E2A78",
  lightColor = "#DCEBFA",
  textColor = "#1B2461",
}: Props) {
  const stripes = 9;
  const stripeW = 100 / (stripes * 2 - 1);

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <ClipPath id="diamond">
            <Polygon points="50,0 100,50 50,100 0,50" />
          </ClipPath>
          <LinearGradient id="sweep" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={lightColor} stopOpacity="0.95" />
            <Stop offset="0.45" stopColor={lightColor} stopOpacity="0.55" />
            <Stop offset="0.7" stopColor={lightColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <G clipPath="url(#diamond)">
          <Rect x="0" y="0" width="100" height="100" fill={lightColor} />
          {/* Diagonal stripes: rotate a set of vertical bars by 45deg */}
          <G transform="rotate(-45 50 50)">
            {Array.from({ length: stripes * 2 }).map((_, i) => (
              <Rect
                key={i}
                x={-50 + i * stripeW * 2}
                y="-50"
                width={stripeW}
                height="200"
                fill={color}
              />
            ))}
          </G>
          <Rect x="0" y="0" width="100" height="100" fill="url(#sweep)" />
        </G>
      </Svg>
      <Text
        style={{
          marginTop: size * 0.05,
          fontSize: size * 0.46,
          lineHeight: size * 0.5,
          fontWeight: "800",
          color: textColor,
          letterSpacing: size * 0.01,
        }}
      >
        RLP
      </Text>
      <Text
        style={{
          fontSize: size * 0.115,
          fontWeight: "400",
          color: textColor,
          letterSpacing: size * 0.036,
          marginTop: -size * 0.01,
        }}
      >
        ENGENHARIA
      </Text>
    </View>
  );
}
