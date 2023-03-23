const fs = require("fs");
const path = require("path");
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
    case "string":
      return string;
    case "text":
      return text;
    case "autocomplete":
      return autocomplete;
    case "array":
      return array;
    case "sshKey":
      return string;
    case "keyValuePairs":
      return keyValuePairs;
    case "filePath":
      return filePath;
    default:
      throw new Error(`Can't resolve parser of type "${type}"`);
  }
}

async function filePath(value, options = {}) {
  if (!_.isString(value) && !_.isNil(value)) {
    throw new Error(`Couldn't parse provided value as file path: ${value}`);
  }

  const newValue = value || "./";
  const absolutePath = path.resolve(newValue);
  const result = {
    passed: value,
    absolutePath,
  };

  try {
    await fs.promises.access(absolutePath, fs.constants.F_OK);
    result.exists = true;
  } catch {
    result.exists = false;
    if (options.throwIfDoesntExist || options.readFileContent) {
      throw new Error(`Path "${value}" does not exist on agent!`);
    }
    return result;
  }

  const pathStat = await fs.promises.lstat(absolutePath);
  result.type = pathStat.isDirectory() ? "directory" : "file";

  if (!options.acceptedTypes?.includes(result.type)) {
    throw new Error(`Path type (${result.type}) is not accepted. Accepted path types: ${options.acceptedTypes.join(", ")}`);
  }

  if (options.readFileContent && result.type !== "file") {
    throw new Error(`Path type must be a file. Provided path is of type ${result.type}`);
  } else if (result.type === "file") {
    result.fileContent = await fs.promises.readFile(result.absolutePath, { encoding: "utf-8" });
  }

  return result;
}

function keyValuePairs(value) {
  if (!_.isString(value) && !_.isPlainObject(value)) {
    throw new Error(`Couldn't parse provided value as JSON: ${value}`);
  }

  if (_.isPlainObject(value)) {
    return value;
  }

  const entries = value
    .split("\n")
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return [key, rest.join("=")];
    });
  return Object.fromEntries(entries);
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
  if (_.isString(value)) { return value.trim(); }
  throw new Error(`Value ${value} is not a valid string`);
}

function text(value) {
  if (_.isNil(value)) { return ""; }
  if (_.isString(value)) { return value; }
  throw new Error(`Value ${value} is not a valid text`);
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
  text,
  keyValuePairs,
  filePath,
};
