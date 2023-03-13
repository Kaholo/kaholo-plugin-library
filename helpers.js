const _ = require("lodash");
const { open, writeFile, unlink } = require("fs/promises");
const util = require("util");
const calculateStringEntropy = require("fast-password-entropy");

const exec = util.promisify(require("child_process").exec);

const parsers = require("./parsers");
const validators = require("./validators");
const {
  loadMethodFromConfiguration,
  loadAccountFromConfiguration,
} = require("./config-loader");
const consts = require("./consts.json");

const CREATE_TEMPORARY_FILE_LINUX_COMMAND = "mktemp -p /tmp kaholo_plugin_library.XXXXXX";
const DEFAULT_PATH_ARGUMENT_REGEX = /(?<=\s|^|\w+=)((?:fileb?:\/\/)?(?:\.\/|\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*'|(?:fileb?:\/\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*')(?=\s|$)/g;
const QUOTES_REGEX = /((?<!\\)["']$|^(?<!\\)["'])/g;
const FILE_PREFIX_REGEX = /^fileb?:\/\//;

async function readActionArguments(action, settings) {
  const methodDefinition = loadMethodFromConfiguration(action.method.name);
  const accountDefinition = loadAccountFromConfiguration();
  const paramValues = removeUndefinedAndEmpty(action.params);
  const settingsValues = removeUndefinedAndEmpty(settings);

  if (_.isNil(methodDefinition)) {
    throw new Error(`Could not find a method "${action.method.name}" in config.json`);
  }

  const paramsParsingPromises = methodDefinition.params.map(async (paramDefinition) => {
    paramValues[paramDefinition.name] = await parseMethodParameter(
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

  await Promise.all(paramsParsingPromises);

  if (accountDefinition) {
    const accountParsingPromises = accountDefinition.params.map(async (paramDefinition) => {
      paramValues[paramDefinition.name] = await parseMethodParameter(
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

    await Promise.all(accountParsingPromises);
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

  const { parserOptions } = paramDefinition;
  const parserToUse = paramDefinition.parserType || paramDefinition.type;
  return parsers.resolveParser(parserToUse)(valueToParse, parserOptions);
}

function createRedactedLogger(secrets) {
  const createRedactedMethod = (originalFunction) => (...args) => {
    const redactedArgs = args.map((arg) => redactSecrets(arg, secrets));
    return originalFunction(...redactedArgs);
  };

  const logger = Object.create(console, {
    info: { value: createRedactedMethod(console.info.bind(console)) },
    // eslint-disable-next-line no-console
    log: { value: createRedactedMethod(console.log.bind(console)) },
    error: { value: createRedactedMethod(console.error.bind(console)) },
    warn: { value: createRedactedMethod(console.warn.bind(console)) },
  });

  return logger;
}

function redactSecrets(input, secrets) {
  const complexSecrets = secrets.filter((secret) => (
    secret.length > 8 || calculateStringEntropy(secret) > consts.ENTROPY_THRESHOLDS[secret.length]
  ));

  const stringifiedInput = JSON.stringify(input);
  const redactedInput = complexSecrets.reduce((acc, cur) => (
    acc.replace(
      new RegExp(escapeRegExp(JSON.stringify(cur).slice(1, -1)), "gm"),
      consts.REDACTED_PLACEHOLDER,
    )
  ), stringifiedInput);

  return JSON.parse(redactedInput);
}

async function getVaultedParameters(params, methodDefinition) {
  const vaultParams = Object.entries(params).filter(([paramName]) => methodDefinition.params.some(
    (paramDefinition) => paramDefinition.type === "vault" && paramDefinition.name === paramName,
  ));
  return Object.fromEntries(vaultParams);
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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  readActionArguments,
  temporaryFileSentinel,
  multipleTemporaryFilesSentinel,
  extractPathsFromCommand,
  generateRandomTemporaryPath,
  generateRandomEnvironmentVariableName,
  analyzePath: parsers.filePath,
  redactSecrets,
  createRedactedLogger,
  getVaultedParameters,
};
