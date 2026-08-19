const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving react-native@0.85.x installed as a transitive
// dependency of other workspace packages (e.g. styled-components via Sanity).
config.resolver.blockList = [
  /node_modules\/\.pnpm\/react-native@0\.85\./,
];

// Ensure react-native always resolves from this app's own node_modules first.
config.resolver.extraNodeModules = {
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
});
