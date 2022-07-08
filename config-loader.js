const path = require("path");

function loadMethodFromConfiguration(methodName) {
  const config = loadConfiguration();
  return config.methods.find((m) => m.name === methodName);
}

function loadAccountFromConfiguration() {
  const config = loadConfiguration();
  return config.auth;
}

function loadConfiguration() {
  try {
    const pluginModulePath = process.argv[2] || "../../../app.js";
    const configPath = path.resolve(path.dirname(pluginModulePath), "config.json");
    // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
    return require(configPath);
  } catch (exception) {
    console.error(exception);
    throw new Error("Could not retrieve the plugin configuration");
  }
}

module.exports = {
  loadMethodFromConfiguration,
  loadAccountFromConfiguration,
};
