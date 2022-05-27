const _ = require("lodash");

function createVolumeConfig(path) {
  const pathEnvironmentVariableName = generateRandomEnvironmentVariableName();
  const mountPointEnvironmentVariableName = generateRandomEnvironmentVariableName();
  const mountPoint = generateRandomTemporaryPath();

  return {
    path: {
      environmentVariable: {
        name: pathEnvironmentVariableName,
        value: path,
      },
      value: `$${pathEnvironmentVariableName}`,
    },
    mountPoint: {
      environmentVariable: {
        name: mountPointEnvironmentVariableName,
        value: mountPoint,
      },
      value: `$${mountPointEnvironmentVariableName}`,
    },
  };
}

function sanitizeCommand(command) {
  return `sh -c ${JSON.stringify(command)}`;
}

function mergeVolumeConfigsEnvironmentVariables(volumeConfigs) {
  if (!volumeConfigs || !_.isArray(volumeConfigs)) {
    throw new Error("Volume Configs param must be an array of objects.");
  }

  const requiredByDocker = volumeConfigs.reduce((acc, curr) => {
    assertVolumeConfigPropertiesExistence(curr, [
      "mountPoint.environmentVariable.name",
      "mountPoint.environmentVariable.value",
    ]);

    return {
      ...acc,
      [curr.mountPoint.environmentVariable.name]: curr.mountPoint.environmentVariable.value,
    };
  }, {});

  const requiredByShell = volumeConfigs.reduce((acc, curr) => {
    assertVolumeConfigPropertiesExistence(curr, [
      "path.environmentVariable.name",
      "path.environmentVariable.value",
    ]);

    return {
      ...acc,
      [curr.path.environmentVariable.name]: curr.path.environmentVariable.value,
    };
  }, requiredByDocker);

  return { requiredByDocker, requiredByShell };
}

function buildDockerCommand({
  command,
  image,
  environmentVariables = [],
  volumeConfigs = [],
  user,
  cwd,
}) {
  if (!image) {
    throw new Error("No Docker image provided.");
  }
  if (!command) {
    throw new Error("No command provided for Docker container.");
  }

  const environmentVariableArguments = buildEnvironmentVariableArguments(environmentVariables);
  const volumeArguments = buildMountVolumeArguments(volumeConfigs);
  const userArguments = user && ["--user", user];
  const cwdArguments = cwd && ["-w", cwd];

  const dockerArguments = ["docker", "run", "--rm"];
  if (environmentVariableArguments) {
    dockerArguments.push(...environmentVariableArguments);
  }
  if (volumeArguments) {
    dockerArguments.push(...volumeArguments);
  }
  if (userArguments) {
    dockerArguments.push(...userArguments);
  }
  if (cwdArguments) {
    dockerArguments.push(...cwdArguments);
  }
  dockerArguments.push(image, command);

  return dockerArguments.join(" ");
}

function buildEnvironmentVariableArguments(environmentVariableNames) {
  if (
    !environmentVariableNames
    || !_.isArray(environmentVariableNames)
    || _.some(environmentVariableNames, (variableName) => !_.isString(variableName))
  ) {
    throw new Error("Environment Variable Names param must be an array of strings.");
  }

  return environmentVariableNames
    .map((variableName) => ["-e", variableName])
    .flat();
}

function buildMountVolumeArguments(volumeConfigs) {
  if (!volumeConfigs || !_.isArray(volumeConfigs)) {
    throw new Error("Volume Configs param must be an array of objects.");
  }

  return volumeConfigs
    .map((volumeConfig) => {
      assertVolumeConfigPropertiesExistence(volumeConfig, [
        "path.value",
        "mountPoint.value",
      ]);

      return ["-v", `${volumeConfig.path.value}:${volumeConfig.mountPoint.value}`];
    })
    .flat();
}

function generateRandomTemporaryPath() {
  return `/tmp/kaholo_tmp_path_${generateRandomString}`;
}

function generateRandomEnvironmentVariableName() {
  return `KAHOLO_ENV_VAR_${generateRandomString().toUpperCase()}`;
}

function generateRandomString() {
  return Math.random().toString(36).slice(2);
}

function assertVolumeConfigPropertiesExistence(volumeConfig = {}, propertyPaths = []) {
  propertyPaths.forEach((propertyPath) => {
    if (!_.has(volumeConfig, propertyPath)) {
      throw new Error(`Volume Config property "${propertyPath}" is missing on: ${JSON.stringify(volumeConfig)}`);
    }
  });
}

module.exports = {
  mergeVolumeConfigsEnvironmentVariables,
  buildDockerCommand,
  createVolumeConfig,
  sanitizeCommand,
};
