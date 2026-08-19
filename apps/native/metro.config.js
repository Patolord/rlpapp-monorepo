const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, "packages/ui"),
  path.resolve(workspaceRoot, "packages/backend"),
  path.resolve(workspaceRoot, "packages/shared"),
  path.resolve(workspaceRoot, "packages/env"),
];

// Prevent Metro from resolving react-native@0.85.x installed as a transitive
// dependency of other workspace packages (e.g. styled-components via Sanity).
config.resolver.blockList = [
  /node_modules\/\.pnpm\/react-native@0\.85\./,
];

// Ensure react-native always resolves from this app's own node_modules first.
config.resolver.extraNodeModules = {
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
});