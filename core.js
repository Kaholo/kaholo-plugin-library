const _ = require("lodash");
const consts = require("./consts.json");
const helpers = require("./helpers");
const redaction = require("./secrets-redaction");
const autocomplete = require("./autocomplete");
const { loadMethodFromConfiguration } = require("./config-loader");

function generatePluginMethod(method) {
  return async (action, settings) => {
    const methodDefinition = loadMethodFromConfiguration(action.method.name);
    const parameters = await helpers.readActionArguments(action, settings, methodDefinition);

    const shouldRedactSecrets = methodDefinition.redactSecrets ?? consts.DEFAULT_REDACT_SECRETS;
    const secrets = shouldRedactSecrets
      && Object.values(await redaction.getVaultedParameters(parameters, methodDefinition));

    const utils = {
      logger: shouldRedactSecrets ? redaction.createRedactedLogger(secrets) : console,
    };

    let result;
    try {
      result = await method(parameters, { action, settings, utils });
    } catch (error) {
      throw shouldRedactSecrets ? redaction.redactSecrets(error, secrets) : error;
    }

    if (_.isNil(result) || _.isEmpty(result)) {
      return consts.OPERATION_FINISHED_SUCCESSFULLY_MESSAGE;
    }

    return shouldRedactSecrets ? redaction.redactSecrets(result, secrets) : result;
  };
}

function generateAutocompleteFunction(autocompleteFunction, functionName) {
  return async (query, settings, params) => {
    const parsedParams = autocomplete.readAutocompleteFunctionArguments(
      params,
      settings,
      functionName,
    );

    return autocompleteFunction(query, parsedParams, { settings, params });
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
