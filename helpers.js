const _ = require("lodash");
const { open, writeFile, unlink } = require("fs/promises");
const util = require("util");
const childProcess = require("child_process");

const parsers = require("./parsers");
const validators = require("./validators");
const {
  loadMethodFromConfiguration,
  loadAccountFromConfiguration,
  loadConfiguration,
} = require("./config-loader");

const exec = util.promisify(childProcess.exec);
const CREATE_TEMPORARY_FILE_LINUX_COMMAND = "mktemp -p /tmp kaholo_plugin_library.XXXXXX";
const DEFAULT_PATH_ARGUMENT_REGEX = /(?<=\s|^|\w+=)((?:fileb?:\/\/)?(?:\.\/|\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)?(?:\.\/|\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*'|(?:fileb?:\/\/)(?:[A-Za-z0-9-_]+\/?)*|"(?:fileb?:\/\/)(?:[^"][A-Za-z0-9-_ ]+\/?)*"|'(?:fileb?:\/\/)(?:[^'][A-Za-z0-9-_ ]+\/?)*')(?=\s|$)/g;
const QUOTES_REGEX = /((?<!\\)["']$|^(?<!\\)["'])/g;
const FILE_PREFIX_REGEX = /^fileb?:\/\//;

async function readActionArguments(
  action,
  settings,
  methodDefinition = loadMethodFromConfiguration(action.method.name),
) {
  const accountDefinition = loadAccountFromConfiguration();

  const paramValues = removeUndefinedAndEmpty(action.params);
  const settingsValues = removeUndefinedAndEmpty(settings);

  if (_.isNil(methodDefinition)) {
    throw new Error(`Could not find a method "${action.method.name}" in config.json`);
  }

  const settingsParamsDefinition = loadConfiguration().settings ?? [];
  const settingsParsingPromises = settingsParamsDefinition.map(async (settingDefinition) => {
    settingsValues[settingDefinition.name] = await parseParameter(
      settingDefinition,
      settingsValues[settingDefinition.name],
    );

    const { validationType } = settingDefinition;
    if (validationType) {
      validateParamValue(
        settingsValues[settingDefinition.name],
        validationType,
      );
    }
  });
  await Promise.all(settingsParsingPromises);

  const paramsParsingPromises = methodDefinition.params.map(async (paramDefinition) => {
    paramValues[paramDefinition.name] = await parseParameter(
      paramDefinition,
      paramValues[paramDefinition.name],
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
      paramValues[paramDefinition.name] = await parseParameter(
        paramDefinition,
        paramValues[paramDefinition.name],
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

  return {
    params: removeUndefinedAndEmpty(paramValues),
    settings: removeUndefinedAndEmpty(settingsValues),
  };
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

async function handleLiveLogging(childProcessInstance, options = {}) {
  if (!childProcessInstance) {
    throw new Error("ChildProcess instance is required for Live Logging handler");
  }

  const {
    onStdoutData = (data) => data && process.stdout.write(data),
    onStderrData = (data) => data && process.stderr.write(data),
    jsonOptions = {},
  } = options;
  const {
    customParse = (chunk) => JSON.parse(String(chunk).trim()),
    customReduce = (accumulatedChunks, jsonChunk) => [...accumulatedChunks, jsonChunk],
    printJsonChunksInActivityLog = false,
    parsingEnabled = true,
    onJsonData,
  } = jsonOptions;

  let childProcessError = null;
  let jsonChunks = [];
  const createOnDataCallback = (onData) => async (chunk) => {
    let isJson = false;

    if (parsingEnabled) {
      const parsedChunk = await attemptParsingChunk(chunk, customParse);
      if (parsedChunk !== null) {
        isJson = true;
        onJsonData?.(parsedChunk);
        jsonChunks = await customReduce(jsonChunks, parsedChunk);
      }
    }

    if (printJsonChunksInActivityLog || !isJson) {
      onData(chunk);
    }
  };

  childProcessInstance.stdout.on("data", createOnDataCallback(onStdoutData));
  childProcessInstance.stderr.on("data", createOnDataCallback(onStderrData));

  try {
    await util.promisify(childProcessInstance.on.bind(childProcessInstance))("close");
  } catch (error) {
    childProcessError = error;
  }

  if (jsonChunks.length === 1) {
    return jsonChunks[0];
  }
  if (jsonChunks.length > 1) {
    return jsonChunks;
  }

  if (childProcessError) {
    throw childProcessError;
  }

  return "";
}

function execWithLiveLogging(command, childProcessOptions = {}, liveLoggingOptions = {}) {
  const childProcessInstance = childProcess.exec(command, childProcessOptions);

  return handleLiveLogging(childProcessInstance, liveLoggingOptions);
}

function spawnWithLiveLogging(
  command,
  args = [],
  childProcessOptions = {},
  liveLoggingOptions = {},
) {
  const childProcessInstance = childProcess.spawn(command, args, childProcessOptions);
  return handleLiveLogging(childProcessInstance, liveLoggingOptions);
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

function parseParameter(paramDefinition, paramValue) {
  if (_.isNil(paramValue)) {
    if (paramDefinition.required) {
      throw Error(`Missing required "${paramDefinition.name}" value`);
    }
    return paramValue;
  }

  const { parserOptions } = paramDefinition;
  const parserToUse = paramDefinition.parserType || paramDefinition.type;
  return parsers.resolveParser(parserToUse)(paramValue, parserOptions);
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

function isResultEmpty(result) {
  return (
    _.isNil(result) // null or undefined
    || (_.isString(result) && result.length === 0) // empty strings
  );
}

async function attemptParsingChunk(chunk, customParse) {
  try {
    return await customParse(chunk);
  } catch (error) {
    return null;
  }
}

module.exports = {
  readActionArguments,
  temporaryFileSentinel,
  multipleTemporaryFilesSentinel,
  extractPathsFromCommand,
  generateRandomTemporaryPath,
  generateRandomEnvironmentVariableName,
  analyzePath: parsers.filePath,
  isResultEmpty,
  handleLiveLogging,
  execWithLiveLogging,
  spawnWithLiveLogging,
};
