const _ = require("lodash");
const { open, writeFile, unlink } = require("fs/promises");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const parsers = require("./parsers");
const validators = require("./validators");
const {
  loadMethodFromConfiguration,
  loadAccountFromConfiguration,
} = require("./config-loader");

const CREATE_TEMPORARY_FILE_LINUX_COMMAND = "mktemp -p /tmp kaholo_plugin_library.XXXXXX";
const DEFAULT_PATH_ARGUMENT_REGEX = /(?<=\s|^|\w+=)((?:fileb?:\/\/)?(?:\.\/|\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*'|(?:fileb?:\/\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*')(?=\s|$)/g;
const QUOTES_REGEX = /((?<!\\)["']$|^(?<!\\)["'])/g;
const FILE_PREFIX_REGEX = /^fileb?:\/\//;

function readActionArguments(action, settings) {
  const method = loadMethodFromConfiguration(action.method.name);
  const account = loadAccountFromConfiguration();
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

    const { validationType } = paramDefinition;
    if (validationType) {
      validateParamValue(
        paramValues[paramDefinition.name],
        validationType,
      );
    }
  });

  if (account) {
    account.params.forEach((paramDefinition) => {
      paramValues[paramDefinition.name] = parseMethodParameter(
        paramDefinition,
        paramValues[paramDefinition.name],
        settingsValues[paramDefinition.name],
      );

      const { validationType } = paramDefinition;
      if (validationType) {
        validateParamValue(
          paramValues[paramDefinition.name],
          validationType,
        );
      }
    });
  }

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

  try {
    await functionToWatch(temporaryFilePath);
  } finally {
    await fileHandle.close();
    await unlink(temporaryFilePath);
  }
}

async function multipleTemporaryFilesSentinel(fileContentsObject, functionToWatch) {
  const temporaryFilePathsEntries = await Promise.all(
    Object.keys(fileContentsObject).map(async (fileIndex) => {
      const { stderr, stdout } = await exec(CREATE_TEMPORARY_FILE_LINUX_COMMAND);
      if (stderr) {
        throw new Error(`Failed to create temporary file: ${stderr}`);
      }

      return [fileIndex, stdout.trim()];
    }),
  );

  const fileHandlesEntries = await Promise.all(
    temporaryFilePathsEntries.map(async ([fileIndex, temporaryFilePath]) => {
      const fileHandle = await open(temporaryFilePath, "a");
      const fileData = fileContentsObject[fileIndex].join("\n");
      await writeFile(fileHandle, fileData);

      return [temporaryFilePath, fileHandle];
    }),
  );

  try {
    await functionToWatch(Object.fromEntries(temporaryFilePathsEntries));
  } finally {
    await Promise.all(
      fileHandlesEntries.map(async ([temporaryFilePath, fileHandle]) => {
        await fileHandle.close();
        await unlink(temporaryFilePath);
      }),
    );
  }
}

function extractPathsFromCommand(commandString, regex = DEFAULT_PATH_ARGUMENT_REGEX) {
  const matches = [...commandString.matchAll(regex)];

  const mappedMatches = matches.map((match) => ({
    path: stripPathArgument(match[0]),
    argument: match[0],
    startIndex: match.index,
    endIndex: match.index + match[0].length - 1,
  }));

  return mappedMatches;
}

function stripPathArgument(pathArgument) {
  return pathArgument
    .replace(QUOTES_REGEX, "")
    .replace(FILE_PREFIX_REGEX, "");
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

function generateRandomTemporaryPath() {
  return `/tmp/kaholo_tmp_path_${generateRandomString()}`;
}

function generateRandomEnvironmentVariableName() {
  return `KAHOLO_ENV_VAR_${generateRandomString().toUpperCase()}`;
}

function generateRandomString() {
  return Math.random().toString(36).slice(2);
}

module.exports = {
  readActionArguments,
  temporaryFileSentinel,
  multipleTemporaryFilesSentinel,
  extractPathsFromCommand,
  generateRandomTemporaryPath,
  generateRandomEnvironmentVariableName,
};
