const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Firebase JS SDK + Metro: default `package.json` "exports" resolution breaks Auth on React Native
config.resolver.unstable_enablePackageExports = false;

// NativeWind/react-native-css-interop wraps resolveRequest; pin scoped packages that have
// been reported as "Unable to resolve" on iOS after resolver changes.
const asyncStorageRoot = path.resolve(
  __dirname,
  "node_modules/@react-native-async-storage/async-storage"
);
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@react-native-async-storage/async-storage": asyncStorageRoot,
};

const merged = withNativeWind(config, { input: "./global.css" });

merged.resolver = merged.resolver || {};
merged.resolver.unstable_enablePackageExports = false;
merged.resolver.extraNodeModules = {
  ...merged.resolver.extraNodeModules,
  "@react-native-async-storage/async-storage": asyncStorageRoot,
};

module.exports = merged;
