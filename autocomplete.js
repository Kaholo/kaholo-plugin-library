const _ = require("lodash");
const parsers = require("./parsers");

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
      [name]: parsers.resolveParser(type || valueType)(value),
    };
  }, {});
}

module.exports = {
  mapAutocompleteFuncParamsToObject,
};
