const _ = require("lodash");
const { open, writeFile, unlink } = require("fs/promises");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const parsers = require("./parsers");
const validators = require("./validators");

const CREATE_TEMPORARY_FILE_LINUX_COMMAND = "mktemp --tmpdir kaholo_plugin_library.XXX";

function readActionArguments(action, settings) {
  const method = loadMethodFromConfiguration(action.method.name);
  const paramValues = removeUndefinedAndEmpty(action.params);
  const settingsValues = removeUndefinedAndEmpty(settings);

  if (_.isNil(method)) {
    throw new Error(`Could not find a method "${action.method.name}" in config.json`);
  }

  method.params.forEach((paramDefinition) => {
    paramValues[paramDefinition.name] = parseMethodParameter(
      paramDefinition,
      paramValues[paramDefinition.name],
      settingsValues[paramDefinition.name],
    );

    const validationType = { paramDefinition };
    if (validationType) {
      validateParamValue(
        paramValues[paramDefinition.name],
        validationType,
      );
    }
  });

  return removeUndefinedAndEmpty(paramValues);
}

async function temporaryFileSentinel(fileDataArray, functionToWatch) {
  const {
    stderr,
    stdout,
  } = await exec(CREATE_TEMPORARY_FILE_LINUX_COMMAND);
  if (stderr) {
    throw new Error(`Failed to create temporary file: ${stderr}`);
  }

  const temporaryFilePath = stdout.trim();

  const fileHandle = await open(temporaryFilePath, "a");
  const fileData = fileDataArray.join("\n");
  await writeFile(fileHandle, fileData);

  await functionToWatch(temporaryFilePath);

  await fileHandle.close();
  await unlink(temporaryFilePath);
}

function removeUndefinedAndEmpty(object) {
  if (!_.isPlainObject(object)) { return _.clone(object); }
  return _.omitBy(object, (value) => value === "" || _.isNil(value) || (_.isObjectLike(value) && _.isEmpty(value)));
}

function parseMethodParameter(paramDefinition, paramValue, settingsValue) {
  const valueToParse = paramValue ?? settingsValue ?? paramDefinition.default;
  if (_.isNil(valueToParse)) {
    if (paramDefinition.required) {
      throw Error(`Missing required "${paramDefinition.name}" value`);
    }
    return valueToParse;
  }

  const parserToUse = paramDefinition.parserType || paramDefinition.type;
  return parsers.resolveParser(parserToUse)(valueToParse);
}

function validateParamValue(
  parameterValue,
  validationType,
) {
  const validate = validators.resolveValidationFunction(validationType);
  return validate(parameterValue);
}

function loadMethodFromConfiguration(methodName) {
  const config = loadConfiguration();
  return config.methods.find((m) => m.name === methodName);
}

function loadConfiguration() {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    return require("../../config.json");
  } catch (exception) {
    console.error(exception);
    throw new Error("Could not retrieve the plugin configuration");
  }
}

module.exports = {
  readActionArguments,
  temporaryFileSentinel,
};
