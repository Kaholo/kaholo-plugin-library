const _ = require("lodash");

function resolveParser(type) {
  switch (type) {
    case "object":
      return object;
    case "int":
    case "float":
    case "number":
      return number;
    case "boolean":
      return boolean;
    case "vault":
    case "options":
    case "text":
    case "string":
      return string;
    case "autocomplete":
      return autocomplete;
    case "array":
      return array;
    case "sshKey":
      return string;
    default:
      throw new Error(`Can't resolve parser of type "${type}"`);
  }
}

function object(value) {
  if (_.isObject(value)) { return value; }
  if (_.isString(value)) {
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new Error(`Couldn't parse provided value as object: ${value}`);
    }
  }
  throw new Error(`${value} is not a valid object`);
}

function number(value) {
  const validNumber = (val) => _.isNumber(val) && _.isFinite(val) && !_.isNaN(val);
  if (validNumber(value)) {
    return value;
  }

  const floatValue = parseFloat(value);
  if (validNumber(floatValue)) {
    return floatValue;
  }
  throw new Error(`Value ${value} is not a valid number`);
}

function boolean(value) {
  if (_.isNil(value)) { return false; }
  if (_.isBoolean(value)) { return value; }
  if (_.isString(value)) {
    const stringValue = value.toLowerCase().trim();
    if (["", "false"].includes(stringValue)) { return false; }
    if (stringValue === "true") { return true; }
  }
  throw new Error(`Value ${value} is not of type boolean`);
}

function string(value) {
  if (_.isNil(value)) { return ""; }
  if (_.isString(value)) { return value; }
  throw new Error(`Value ${value} is not a valid string`);
}

function autocomplete(value) {
  if (_.isNil(value)) { return ""; }
  if (_.isString(value)) { return value; }
  if (_.isObject(value) && _.has(value, "id")) { return value.id; }
  throw new Error(`Value "${value}" is not a valid autocomplete result nor string.`);
}

function array(value) {
  if (_.isNil(value)) { return []; }
  if (_.isArray(value)) { return value; }
  if (_.isString(value)) {
    return _.compact(
      value.split("\n").map(_.trim),
    );
  }
  throw new Error("Unsupported array format");
}

module.exports = {
  resolveParser,
  string,
  autocomplete,
  boolean,
  number,
  object,
  array,
};
