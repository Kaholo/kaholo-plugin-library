const _ = require("lodash");
const consts = require("./consts.json");
const helpers = require("./helpers");
const autocomplete = require("./autocomplete");

function generatePluginMethod(method) {
  return async (action, settings) => {
    const parameters = await helpers.readActionArguments(action, settings);

    const result = await method(parameters, { action, settings });
    if (_.isNil(result) || _.isEmpty(result)) {
      return consts.OPERATION_FINISHED_SUCCESSFULLY_MESSAGE;
    }
    return result;
  };
}

function generateAutocompleteFunction(autocompleteFunction) {
  return async (query, pluginSettings, actionParams) => {
    const [params, settings] = [actionParams, pluginSettings]
      .map(autocomplete.mapAutocompleteFuncParamsToObject);

    _.entries(settings).forEach(([key, value]) => {
      if (_.isNil(params[key]) || _.isEmpty(params[key])) {
        params[key] = value;
      }
    });

    return autocompleteFunction(query, params, { pluginSettings, actionParams });
  };
}

function bootstrap(pluginMethods, autocompleteFunctions) {
  const bootstrappedPluginMethods = _.entries(pluginMethods)
    .map(([methodName, method]) => ({
      [methodName]: generatePluginMethod(method),
    }));

  const bootstrappedAutocompleteFuncs = _.entries(autocompleteFunctions)
    .map(([functionName, autocompleteFunction]) => ({
      [functionName]: generateAutocompleteFunction(autocompleteFunction),
    }));

  return _.merge(...bootstrappedPluginMethods, ...bootstrappedAutocompleteFuncs);
}

module.exports = {
  bootstrap,
};
