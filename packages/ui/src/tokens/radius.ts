/**
 * Shared radius scale. Base radius matches the web `--radius` token (0.625rem).
 * Values are expressed in rem for web and px for native consumption.
 */

const BASE_REM = 0.625;
const REM_TO_PX = 16;

export const radius = {
  sm: `${BASE_REM - 0.25}rem`,
  md: `${BASE_REM - 0.125}rem`,
  lg: `${BASE_REM}rem`,
  xl: `${BASE_REM + 0.25}rem`,
  "2xl": `${BASE_REM + 0.5}rem`,
  full: "9999px",
} as const;

export const radiusPx = {
  sm: (BASE_REM - 0.25) * REM_TO_PX,
  md: (BASE_REM - 0.125) * REM_TO_PX,
  lg: BASE_REM * REM_TO_PX,
  xl: (BASE_REM + 0.25) * REM_TO_PX,
  "2xl": (BASE_REM + 0.5) * REM_TO_PX,
  full: 9999,
} as const;

export type RadiusKey = keyof typeof radius;
