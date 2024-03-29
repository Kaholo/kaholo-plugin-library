const _ = require("lodash");
const { loadConfiguration } = require("./config-loader");
const { readActionArguments } = require("./helpers");

function mapAutocompleteFuncParamsToObject(params) {
  if (!_.isArray(params)) {
    throw new Error("Failed to map autocomplete parameters to object – params provided are not an array");
  }
  if (!_.every(params, _.isObject)) {
    throw new Error("Failed to map autocomplete parameters to object - every item of params array need to be an object");
  }
  return params.reduce((acc, {
    value, name, type, valueType,
  }) => {
    if (_.isNil(name)) {
      throw new Error("Failed to map one of autocomplete parameters to object - `name` field is required");
    }
    if (_.isNil(type || valueType)) {
      throw new Error("Failed to map one of autocomplete parameters to object - either `type` or `valueType` field is required");
    }

    if (_.isNil(value)) {
      return acc;
    }

    return {
      ...acc,
      [name]: value,
    };
  }, {});
}

function findMatchingMethodDefinition(sortedParamNames) {
  const config = loadConfiguration();
  const accountParamNames = new Set(config.auth ? _.map(config.auth.params, "name") : []);
  const cleanParamNames = sortedParamNames.filter((paramName) => {
    if (accountParamNames.has(paramName)) {
      accountParamNames.delete(paramName);
      return false;
    }
    return true;
  });

  const matchingMethodDefinition = config.methods.find((method) => (
    _.isEqual(
      cleanParamNames,
      _.sortBy(_.map(method.params, "name")),
    )
  ));

  return matchingMethodDefinition;
}

function readAutocompleteFunctionArguments(params, settings) {
  const paramNames = _.sortBy(_.map(params, "name"));
  const methodDefinition = findMatchingMethodDefinition(paramNames);

  if (!methodDefinition) {
    return {
      ...mapAutocompleteFuncParamsToObject(settings),
      ...mapAutocompleteFuncParamsToObject(params),
    };
  }

  methodDefinition.params = methodDefinition.params.map((param) => ({
    ...param,
    required: false,
  }));

  return readActionArguments(
    {
      params: mapAutocompleteFuncParamsToObject(params),
    },
    mapAutocompleteFuncParamsToObject(settings),
    methodDefinition,
  );
}

module.exports = {
  mapAutocompleteFuncParamsToObject,
  readAutocompleteFunctionArguments,
};
