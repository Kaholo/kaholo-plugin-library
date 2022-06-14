const _ = require("lodash");
const {
  generateRandomEnvironmentVariableName,
  generateRandomTemporaryPath,
} = require("./helpers");

function createVolumeDefinition(path) {
  if (!path) {
    throw new Error("Path is required to create Volume Definition.");
  }
  if (!_.isString(path)) {
    throw new Error("Path parameter must be a string.");
  }

  const pathEnvironmentVariableName = generateRandomEnvironmentVariableName();
  const mountPointEnvironmentVariableName = generateRandomEnvironmentVariableName();
  const mountPoint = generateRandomTemporaryPath();

  return {
    path: {
      name: pathEnvironmentVariableName,
      value: path,
    },
    mountPoint: {
      name: mountPointEnvironmentVariableName,
      value: mountPoint,
    },
  };
}

function sanitizeCommand(command, commandPrefix) {
  if (!command || !_.isString(command)) {
    throw new Error("Command parameter must be a string.");
  }

  let commandWithPrefix = command;
  if (commandPrefix) {
    commandWithPrefix = command.startsWith(`${commandPrefix} `) ? command : `${commandPrefix} ${command}`;
  }

  return `sh -c ${JSON.stringify(commandWithPrefix)}`;
}

function buildDockerCommand({
  command,
  image,
  environmentVariables = {},
  volumeDefinitionsArray = [],
  additionalArguments = [],
  workingDirectory,
  user,
}) {
  if (!image) {
    throw new Error("No Docker image provided.");
  }
  if (!command) {
    throw new Error("No command provided for Docker container.");
  }

  if (
    additionalArguments && (
      !_.isArray(additionalArguments)
      || _.some(additionalArguments, (additionalArgument) => !_.isString(additionalArgument))
    )
  ) {
    throw new Error("Additional Arguments must be an array of strings.");
  }

  const environmentVariableArguments = buildEnvironmentVariableArguments(environmentVariables);
  const volumeArguments = buildMountVolumeArguments(volumeDefinitionsArray);

  const dockerArguments = ["docker", "run", "--rm"];
  dockerArguments.push(...environmentVariableArguments);
  dockerArguments.push(...volumeArguments);
  dockerArguments.push(...additionalArguments);
  if (user) {
    dockerArguments.push("--user", user);
  }
  if (workingDirectory) {
    dockerArguments.push("-w", workingDirectory);
  }
  dockerArguments.push(image, command);

  return dockerArguments.join(" ");
}

function buildEnvironmentVariableArguments(environmentVariables) {
  if (
    !environmentVariables
    || !_.isObject(environmentVariables)
    || _.isArray(environmentVariables)
  ) {
    throw new Error("environmentVariables parameter must be an object.");
  }

  return Object.entries(environmentVariables)
    .map(([name]) => ["-e", name])
    .flat();
}

function buildMountVolumeArguments(volumeDefinitions) {
  if (!volumeDefinitions || !_.isArray(volumeDefinitions)) {
    throw new Error("volumeDefinitions parameter must be an array of objects.");
  }

  return volumeDefinitions
    .map((definition) => {
      assertVolumeConfigPropertiesExistence(definition, [
        "path.value",
        "mountPoint.value",
      ]);

      return [
        "-v",
        `$${definition.path.name}:$${definition.mountPoint.name}`,
      ];
    })
    .flat();
}

function assertVolumeConfigPropertiesExistence(volumeConfig = {}, propertyPaths = []) {
  propertyPaths.forEach((propertyPath) => {
    if (!_.has(volumeConfig, propertyPath)) {
      throw new Error(`Volume Config property "${propertyPath}" is missing on: ${JSON.stringify(volumeConfig)}`);
    }
  });
}

module.exports = {
  buildDockerCommand,
  createVolumeDefinition,
  sanitizeCommand,
  buildEnvironmentVariableArguments,
  buildMountVolumeArguments,
};
