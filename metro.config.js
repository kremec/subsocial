const { getDefaultConfig } = require("expo/metro-config");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);
config.transformer.babelTransformerPath =
  require.resolve("./metro.transformer");

module.exports = config;
