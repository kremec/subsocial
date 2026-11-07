const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const supportedLocales = readdirSync(
  join(__dirname, "../src/translation/locales"),
)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => Intl.getCanonicalLocales(file.slice(0, -5))[0]);

module.exports = { supportedLocales };
