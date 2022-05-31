const { docker } = require(".");

const ENVIRONMENT_VAR_NAME_REGEX = /^KAHOLO_ENV_VAR_[A-Z0-9]+$/;
const ENVIRONMENT_VAR_REGEX = /^\$KAHOLO_ENV_VAR_[A-Z0-9]+$/;
const TEMPORARY_PATH_REGEX = /^\/tmp\/kaholo_tmp_path_[a-z0-9]+$/;

describe("Docker helper functions", () => {
  describe("createVolumeConfig", () => {
    it("should correctly create a valid Volume Config", () => {
      const pathOnAgent = "/path/to/file";
      const volumeConfig = docker.createVolumeConfig(pathOnAgent);

      expect(volumeConfig).toBeDefined();

      expect(volumeConfig.path.value).toMatch(ENVIRONMENT_VAR_REGEX);
      expect(volumeConfig.mountPoint.value).toMatch(ENVIRONMENT_VAR_REGEX);

      expect(volumeConfig.path.environmentVariable.name).toMatch(ENVIRONMENT_VAR_NAME_REGEX);
      expect(volumeConfig.mountPoint.environmentVariable.name).toMatch(ENVIRONMENT_VAR_NAME_REGEX);

      expect(volumeConfig.path.environmentVariable.value).toMatch(pathOnAgent);
      expect(volumeConfig.mountPoint.environmentVariable.value).toMatch(TEMPORARY_PATH_REGEX);
    });

    it("should fail to create a Volume Config with nil path", () => {
      const invalidPaths = [null, undefined, ""];

      invalidPaths.forEach((invalidPath) => {
        expect(docker.createVolumeConfig.bind(null, invalidPath)).toThrowError("Path is required to create Volume Config.");
      });
    });

    it("should fail to create a Volume Config with non-string path", () => {
      const nonStringPath = { path: "/path/to/file" };

      expect(docker.createVolumeConfig.bind(null, nonStringPath)).toThrowError("Path parameter must be a string.");
    });
  });

  describe("sanitizeCommand", () => {
    it("should correctly sanitize a command", () => {
      const command = "echo $(id) --test \"quotes\"";

      const sanitizedCommand = docker.sanitizeCommand(command);
      const expectedCommand = "sh -c \"echo $(id) --test \\\"quotes\\\"\"";

      expect(sanitizedCommand).toEqual(expectedCommand);
    });

    it("should prepend command prefix", () => {
      const command = "echo";
      const commandPrefix = "sh -c";

      const sanitizedCommand = docker.sanitizeCommand(command, commandPrefix);
      const expectedCommand = "sh -c \"sh -c echo\"";

      expect(sanitizedCommand).toEqual(expectedCommand);
    });

    it("shouldn't prepend command prefix", () => {
      const command = "sh -c \"echo hello world\"";
      const commandPrefix = "sh -c";

      const sanitizedCommand = docker.sanitizeCommand(command, commandPrefix);
      const expectedCommand = "sh -c \"sh -c \\\"echo hello world\\\"\"";

      expect(sanitizedCommand).toEqual(expectedCommand);
    });

    it("should throw an error if a command is not a string", () => {
      const invalidCommands = [4, null, {}, undefined];

      invalidCommands.forEach((invalidCommand) => {
        expect(docker.sanitizeCommand.bind(null, invalidCommand)).toThrowError("Command parameter must be a string.");
      });
    });
  });

  describe("extractEnvironmentVariablesFromVolumeConfigs", () => {
    it("should correctly extract environment variables", () => {
      const {
        environmentVariablesRequiredByDocker,
        environmentVariablesRequiredByShell,
      } = docker.extractEnvironmentVariablesFromVolumeConfigs([
        docker.createVolumeConfig("/path/to/file1"),
        docker.createVolumeConfig("/path/to/file2"),
      ]);

      expect(Object.keys(environmentVariablesRequiredByShell).length).toEqual(4);
      expect(Object.keys(environmentVariablesRequiredByDocker).length).toEqual(2);

      Object.keys(environmentVariablesRequiredByShell).forEach((envName) => {
        expect(envName).toMatch(ENVIRONMENT_VAR_NAME_REGEX);
      });
    });

    it("should throw an error if a Volume Config is invalid", () => {
      const invalidVolumeConfig = {
        path: {
          environmentVariable: {},
        },
      };

      expect(
        docker.extractEnvironmentVariablesFromVolumeConfigs.bind(null, [invalidVolumeConfig]),
      ).toThrowError(`Volume Config property "mountPoint.environmentVariable.name" is missing on: ${JSON.stringify(invalidVolumeConfig)}`);
    });

    it("should throw an error if there are no passed Volume Configs", () => {
      expect(
        docker.extractEnvironmentVariablesFromVolumeConfigs,
      ).toThrowError("Volume Configs parameter must be an array of objects.");

      const invalidVolumeConfigsParams = [null, {}, undefined, 3, "invalid"];
      invalidVolumeConfigsParams.forEach((invalidParam) => {
        expect(
          docker.extractEnvironmentVariablesFromVolumeConfigs.bind(null, invalidParam),
        ).toThrowError("Volume Configs parameter must be an array of objects.");
      });
    });
  });

  describe("buildDockerCommand", () => {
    it("should build a valid docker command with no extra options", () => {
      const command = "echo hello world";
      const image = "test/image";

      const dockerCommand = docker.buildDockerCommand({ command, image });

      expect(dockerCommand).toEqual("docker run --rm test/image echo hello world");
    });

    it("should build a valid docker command with user and working directory arguments", () => {
      const command = "echo hello world";
      const image = "test/image-2";
      const user = "admin";
      const workingDirectory = "/path/to/cwd";

      const dockerCommand = docker.buildDockerCommand({
        command,
        image,
        user,
        workingDirectory,
      });

      expect(dockerCommand).toEqual("docker run --rm --user admin -w /path/to/cwd test/image-2 echo hello world");
    });

    it("should build a valid docker command with environment variables and volumes", () => {
      const command = "echo hello world!";
      const image = "test/image-3";
      const volumeConfigs = [docker.createVolumeConfig("/path/to/file")];
      const environmentVariables = (
        docker.extractEnvironmentVariablesFromVolumeConfigs(volumeConfigs)
      );

      const dockerCommand = docker.buildDockerCommand({
        command,
        image,
        volumeConfigs,
        environmentVariables: (
          Object.keys(environmentVariables.environmentVariablesRequiredByDocker)
        ),
      });

      const environmentVariableKeys = (
        Object.keys(environmentVariables.environmentVariablesRequiredByDocker)
      );
      const expectedDockerCommand = `docker run --rm -e ${environmentVariableKeys[0]} -v ${volumeConfigs[0].path.value}:${volumeConfigs[0].mountPoint.value} test/image-3 echo hello world!`;

      expect(dockerCommand).toEqual(expectedDockerCommand);
    });

    it("should build a valid docker command with additional arguments", () => {
      const image = "test/image";
      const command = "echo";
      const additionalArguments = ["-w", "/test/dir"];

      const dockerCommand = docker.buildDockerCommand({
        image,
        command,
        additionalArguments,
      });
      const expectedDockerCommand = "docker run --rm -w /test/dir test/image echo";

      expect(dockerCommand).toEqual(expectedDockerCommand);
    });

    it("should throw an error if additional arguments param is invalid", () => {
      const image = "test/image";
      const command = "echo";
      const invalidParams = [4, {}, "invalid", true];

      invalidParams.forEach((invalidParam) => {
        const payload = {
          image,
          command,
          additionalArguments: invalidParam,
        };

        expect(
          docker.buildDockerCommand.bind(null, payload),
        ).toThrowError("Additional Arguments must be an array of strings.");
      });
    });

    it("should throw an error if there is no image passed", () => {
      expect(
        docker.buildDockerCommand.bind(null, { command: "somecommand" }),
      ).toThrowError("No Docker image provided.");
    });

    it("should throw an error if there is no command passed", () => {
      expect(
        docker.buildDockerCommand.bind(null, { image: "someimage" }),
      ).toThrowError("No command provided for Docker container.");
    });
  });

  describe("buildEnvironmentVariableArguments", () => {
    it("should return array of passed arguments with prepended \"-e\" elements", () => {
      const environmentVariableNames = ["TEST_VAR", "SOME_OTHER_TEST_VAR"];
      const environmentArguments = (
        docker.buildEnvironmentVariableArguments(environmentVariableNames)
      );

      expect(environmentArguments).toStrictEqual(["-e", "TEST_VAR", "-e", "SOME_OTHER_TEST_VAR"]);
    });

    it("should throw an error if invalid argument is passed", () => {
      const invalidArguments = [
        undefined,
        null,
        {},
        "invalid",
        [1, "value"],
        [{}, "test"],
        13,
      ];

      invalidArguments.forEach((invalidArgument) => {
        expect(
          docker.buildEnvironmentVariableArguments.bind(null, invalidArgument),
        ).toThrowError("Environment Variable Names parameter must be an array of strings.");
      });
    });
  });

  describe("buildMountVolumeArguments", () => {
    it("should return valid array of volume docker arguments", () => {
      const volumeConfigs = [
        docker.createVolumeConfig("/path/to/file"),
        docker.createVolumeConfig("/path/to/other/file"),
      ];
      const mountVolumeArguments = docker.buildMountVolumeArguments(volumeConfigs);

      expect(mountVolumeArguments).toStrictEqual([
        "-v",
        `${volumeConfigs[0].path.value}:${volumeConfigs[0].mountPoint.value}`,
        "-v",
        `${volumeConfigs[1].path.value}:${volumeConfigs[1].mountPoint.value}`,
      ]);
    });

    it("should throw an error if invalid argument is passed", () => {
      const invalidArguments = [
        1,
        {},
        undefined,
        null,
        "invalid",
      ];

      invalidArguments.forEach((invalidArgument) => {
        expect(
          docker.buildMountVolumeArguments.bind(null, invalidArgument),
        ).toThrowError("Volume Configs parameter must be an array of objects.");
      });
    });

    it("should throw an error if invalid Volume Config is passed", () => {
      const invalidVolumeConfigs1 = [
        {
          path: {},
          mountPoint: {},
        },
      ];

      expect(
        docker.buildMountVolumeArguments.bind(null, invalidVolumeConfigs1),
      ).toThrowError(`Volume Config property "path.value" is missing on: ${JSON.stringify(invalidVolumeConfigs1[0])}`);

      const invalidVolumeConfigs2 = [
        {
          path: {
            value: "test-value",
          },
          mountPoint: {},
        },
      ];

      expect(
        docker.buildMountVolumeArguments.bind(null, invalidVolumeConfigs2),
      ).toThrowError(`Volume Config property "mountPoint.value" is missing on: ${JSON.stringify(invalidVolumeConfigs2[0])}`);
    });
  });
});
