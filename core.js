const _ = require("lodash");

const consts = require("./consts.json");
const helpers = require("./helpers");
const redaction = require("./secrets-redaction");
const autocomplete = require("./autocomplete");
const {
  loadMethodFromConfiguration,
  loadConfiguration,
} = require("./config-loader");

function generatePluginMethod(method) {
  return async (action, settings) => {
    const methodDefinition = loadMethodFromConfiguration(action.method.name);
    const pluginDefinition = loadConfiguration();
    const {
      params,
      settings: parsedSettings,
    } = await helpers.readActionArguments(action, settings, methodDefinition);

    const allowEmptyResult = methodDefinition.allowEmptyResult ?? false;
    const shouldRedactSecrets = methodDefinition.redactSecrets ?? consts.DEFAULT_REDACT_SECRETS;
    const secrets = [];
    if (shouldRedactSecrets) {
      const paramsDefinition = [
        ...(methodDefinition.params ?? []),
        ...(pluginDefinition.auth?.params ?? []),
      ];
      const secretsObject = redaction.filterVaultedParameters(params, paramsDefinition);
      secrets.push(...Object.values(secretsObject));
    }

    const utils = {
      logger: shouldRedactSecrets ? redaction.createRedactedLogger(secrets) : console,
    };

    let result;
    try {
      result = await method(params, {
        action,
        settings,
        utils,
        parsedSettings,
      });
    } catch (error) {
      throw shouldRedactSecrets ? redaction.redactSecrets(error, secrets) : error;
    }

    if (!allowEmptyResult && helpers.isResultEmpty(result)) {
      return consts.OPERATION_FINISHED_SUCCESSFULLY_MESSAGE;
    }

    return shouldRedactSecrets ? redaction.redactSecrets(result, secrets) : result;
  };
}

function generateAutocompleteFunction(autocompleteFunction, functionName) {
  return async (query, settings, params) => {
    const {
      params: parsedParams,
      settings: parsedSettings,
    } = await autocomplete.readAutocompleteFunctionArguments(
      params,
      settings,
      functionName,
    );

    return autocompleteFunction(query, parsedParams, { settings, params, parsedSettings });
  };
}

function bootstrap(pluginMethods, autocompleteFunctions) {
  const bootstrappedPluginMethods = _.entries(pluginMethods)
    .map(([methodName, method]) => ({
      [methodName]: generatePluginMethod(method),
    }));

  const bootstrappedAutocompleteFuncs = _.entries(autocompleteFunctions)
    .map(([functionName, autocompleteFunction]) => ({
      [functionName]: generateAutocompleteFunction(autocompleteFunction, functionName),
    }));

  return _.merge(...bootstrappedPluginMethods, ...bootstrappedAutocompleteFuncs);
}

module.exports = {
  bootstrap,
};
