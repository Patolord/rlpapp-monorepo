// A configuração do app continua em app.json; este arquivo só barra o build
// da EAS quando faltam as variáveis públicas que o bundle embute.
//
// O `doppler run` dos scripts `build:*` só vale na máquina local: o bundle JS
// é gerado no builder da EAS, que enxerga apenas as variáveis do ambiente EAS
// do perfil (development / preview / production). Sem elas o build passa, mas
// o `@rlpapp/env/native` lança erro na abertura e o app fecha sozinho.
const REQUIRED = ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"];

module.exports = ({ config }) => {
  // No dev client o bundle vem do Metro local (com Doppler), não do builder.
  const embedsBundle =
    process.env.EAS_BUILD === "true" && process.env.EAS_BUILD_PROFILE !== "development";

  if (embedsBundle) {
    const missing = REQUIRED.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      const environment = process.env.EAS_BUILD_PROFILE ?? "production";
      throw new Error(
        `Faltam variáveis no ambiente "${environment}" da EAS: ${missing.join(", ")}. ` +
          `Cadastre com \`eas env:create --environment ${environment}\` (visibilidade plaintext) ` +
          "e gere o build de novo; sem elas o app fecha ao abrir."
      );
    }
  }

  return config;
};
