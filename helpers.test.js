const util = require("util");
const exec = util.promisify(require("child_process").exec);
const { open } = require("fs/promises");

const helpers = require("./helpers");
const {
  loadAccountFromConfiguration,
  loadMethodFromConfiguration,
} = require("./config-loader");

jest.mock("./config-loader");

describe("temporaryFileSentinel", () => {
  it("Should create and pass the file properly to the function", async () => {
    const fileData = "someRandomString";

    await helpers.temporaryFileSentinel(
      [fileData],
      async (pathToTempFile) => {
        const {
          stdout,
        } = await exec(`cat ${pathToTempFile}`);

        expect(stdout.trim()).toBe(fileData);
      },
    );
  });

  it("Should clean up the file after the function finishes", async () => {
    let pathToTempFile = null;

    await helpers.temporaryFileSentinel(
      [],
      async (filePath) => {
        pathToTempFile = filePath;
      },
    );

    await expect(async () => {
      await open(pathToTempFile, "r");
    }).rejects.toThrow(`ENOENT: no such file or directory, open '${pathToTempFile}'`);
  });

  it("should remove the file even if the function throws an error", async () => {
    let tempFilePath;

    await helpers.temporaryFileSentinel([], async (filePath) => {
      tempFilePath = filePath;
      throw new Error();
    }).catch(() => {}); // Ignore error

    expect(() => open(tempFilePath, "r")).rejects.toThrow(`ENOENT: no such file or directory, open '${tempFilePath}'`);
  });
});

describe("multipleTemporaryFilesSentinel", () => {
  it("should create multiple temporary files and clean up afterwards", async () => {
    const files = {
      file1: ["some-content"],
      file2: ["also-some-content", "more-content", "content"],
      file3: ["some-other-content", "testing content"],
    };
    const temporaryFilePaths = [];

    await helpers.multipleTemporaryFilesSentinel(
      files,
      async (filePaths) => {
        temporaryFilePaths.push(...Object.values(filePaths));
        return Promise.all(
          Object.entries(files).map(async ([fileIndex, fileContent]) => {
            expect(filePaths[fileIndex]).toBeDefined();

            const { stdout } = await exec(`cat ${filePaths[fileIndex]}`);
            expect(stdout.trim()).toEqual(fileContent.join("\n"));
          }),
        );
      },
    );

    expect(temporaryFilePaths.length).toEqual(Object.keys(files).length);
    expect(temporaryFilePaths).toContainEqual(expect.any(String));

    temporaryFilePaths.forEach((temporaryFilePath) => {
      expect(() => open(temporaryFilePath)).rejects.toThrowError(`ENOENT: no such file or directory, open '${temporaryFilePath}'`);
    });
  });

  it("should clean up temporary files in case of error in callback function", async () => {
    const files = {
      file1: ["content"],
      file2: ["content"],
    };
    const temporaryFilePaths = [];

    await helpers.multipleTemporaryFilesSentinel(
      files,
      (filePaths) => {
        temporaryFilePaths.push(...Object.values(filePaths));
        throw new Error();
      },
    ).catch(() => {}); // Ignore error

    temporaryFilePaths.forEach((temporaryFilePath) => {
      expect(() => open(temporaryFilePath)).rejects.toThrowError(`ENOENT: no such file or directory, open '${temporaryFilePath}'`);
    });
  });
});

describe("extractPathsFromCommand", () => {
  it("should extract all paths", () => {
    const commandString = "mkdir /tmp/dir /tmp/dir2/";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].startIndex).toEqual(6);
    expect(extractedPaths[0].endIndex).toEqual(13);
    expect(extractedPaths[0].argument).toMatch("/tmp/dir");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2/");
    expect(extractedPaths[1].argument).toMatch("/tmp/dir2/");
  });

  it("should extract all paths wrapped with \"", () => {
    const commandString = "mkdir \"/tmp/dir\" -p=\"/tmp/dir2\"";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].startIndex).toEqual(6);
    expect(extractedPaths[0].endIndex).toEqual(15);
    expect(extractedPaths[0].argument).toMatch("\"/tmp/dir\"");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2");
    expect(extractedPaths[1].argument).toMatch("\"/tmp/dir2\"");
  });

  it("should extract all paths wrapped with '", () => {
    const commandString = "mkdir -p='/tmp/dir' -p='/tmp/dir2'";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].startIndex).toEqual(9);
    expect(extractedPaths[0].endIndex).toEqual(18);
    expect(extractedPaths[0].argument).toMatch("'/tmp/dir'");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2");
    expect(extractedPaths[1].argument).toMatch("'/tmp/dir2'");
  });

  it("should extract paths starting with file(b)://", () => {
    const commandString = "somecmd -p file:///path/to/the/file -r=fileb://some-directory/file";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/path/to/the/file");
    expect(extractedPaths[0].startIndex).toEqual(11);
    expect(extractedPaths[0].endIndex).toEqual(34);
    expect(extractedPaths[0].argument).toMatch("file:///path/to/the/file");

    expect(extractedPaths[1].path).toMatch("some-directory/file");
    expect(extractedPaths[1].argument).toMatch("fileb://some-directory/file");
  });

  it("should extract paths starting with file(b):// wrapped with \"", () => {
    const commandString = "somecmd -p=\"fileb:///path/to the/file\" -r \"file://relative path/to the/file\"";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/path/to the/file");
    expect(extractedPaths[0].startIndex).toEqual(11);
    expect(extractedPaths[0].endIndex).toEqual(37);
    expect(extractedPaths[0].argument).toMatch("\"fileb:///path/to the/file\"");

    expect(extractedPaths[1].path).toMatch("relative path/to the/file");
    expect(extractedPaths[1].argument).toMatch("\"file://relative path/to the/file\"");
  });

  it("should extract paths starting with file(b):// wrapped with '", () => {
    const commandString = "somecmd -p 'fileb:///path/to the/file' -r='file://relative path/to the/file'";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/path/to the/file");
    expect(extractedPaths[0].argument).toMatch("'fileb:///path/to the/file'");

    expect(extractedPaths[1].path).toMatch("relative path/to the/file");
    expect(extractedPaths[1].startIndex).toEqual(42);
    expect(extractedPaths[1].endIndex).toEqual(75);
    expect(extractedPaths[1].argument).toMatch("'file://relative path/to the/file'");
  });
});

describe("Unique random functions", () => {
  const testUniqueRandomFunction = (functionName, matchParam, sampleSize = 200) => {
    const generatedValues = new Array(sampleSize).fill(0).map(helpers[functionName]);
    const scannedValues = new Set();

    generatedValues.forEach((generatedPath) => {
      expect(scannedValues.has(generatedPath)).toBeFalsy();
      scannedValues.add(generatedPath);

      expect(generatedPath).toMatch(matchParam);
    });
  };

  describe("generateRandomTemporaryPath", () => {
    it("should create unique paths in /tmp directory", () => {
      testUniqueRandomFunction("generateRandomTemporaryPath", /^\/tmp\/kaholo_tmp_path_[a-z0-9]+$/);
    });
  });

  describe("generateRandomEnvironmentVariableName", () => {
    it("should create unique environment variable names", () => {
      testUniqueRandomFunction("generateRandomEnvironmentVariableName", /^KAHOLO_ENV_VAR_[A-Z0-9]+$/);
    });
  });
});

describe("readActionArguments", () => {
  const { readActionArguments } = helpers;

  describe("testing config with account", () => {
    beforeAll(() => {
      // eslint-disable-next-line global-require
      const accountConfig = require("./mocks/account-config.json");
      loadMethodFromConfiguration.mockImplementation((methodName) => (
        accountConfig.methods.find((m) => m.name === methodName)
      ));
      loadAccountFromConfiguration.mockImplementation(() => accountConfig.auth);
    });

    it("should parse parameters and accounts accordingly to the config", () => {
      const account = {
        email: "test@example.com",
        password: "test123",
        namespaceConfig: JSON.stringify({ name: "test-namespace" }),
        objects: "object-1\nobject-2\nobject-3",
      };
      const action = {
        method: { name: "testMethodOne" },
        params: {
          ...account,
          testParameterOne: "test",
          testParameterTwo: "1",
          testParameterThree: { id: "autocomplete-item-1", value: "Autocomplete 1" },
        },
      };
      const settings = {};

      const readArguments = readActionArguments(action, settings);

      expect(readArguments.testParameterOne).toStrictEqual("test");
      expect(readArguments.testParameterTwo).toEqual(1);
      expect(readArguments.testParameterThree).toStrictEqual("autocomplete-item-1");
      expect(readArguments.email).toStrictEqual("test@example.com");
      expect(readArguments.password).toStrictEqual("test123");
      expect(readArguments.namespaceConfig).toStrictEqual({ name: "test-namespace" });
      expect(readArguments.objects).toStrictEqual(["object-1", "object-2", "object-3"]);
    });

    it("should parse parameters accordingly to the config and validate them", () => {
      const EXAMPLE_SSH_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nasdasdasdasasd\n-----END OPENSSH PRIVATE KEY-----\n";
      const account = {
        email: "test@example.com",
        password: "test123",
      };
      const action = {
        method: { name: "testMethodTwo" },
        params: {
          ...account,
          testParameterFour: "test",
          testParameterFive: EXAMPLE_SSH_KEY,
        },
      };
      const settings = {};

      const readArguments = readActionArguments(action, settings);

      expect(readArguments.testParameterFive).toStrictEqual(EXAMPLE_SSH_KEY);
    });

    it("should throw if no suitable parser is found", () => {
      const EXAMPLE_INVALID_SSH_KEY = "INVALID SSH";
      const account = {
        email: "test@example.com",
        password: "test123",
      };
      const action = {
        method: { name: "testMethodTwo" },
        params: {
          ...account,
          testParameterFour: "test",
          testParameterFive: EXAMPLE_INVALID_SSH_KEY,
        },
      };
      const settings = {};

      expect(() => {
        readActionArguments(action, settings);
      }).toThrowError("Missing line feed character at the end of the file.");
    });
  });

  describe("testing config with no account", () => {
    beforeAll(() => {
      loadMethodFromConfiguration.mockImplementation((methodName) => (
        // eslint-disable-next-line global-require
        require("./mocks/no-account-config.json").methods.find((m) => m.name === methodName)
      ));
      loadAccountFromConfiguration.mockImplementation(() => null);
    });

    it("should fail if method definition is missing", () => {
      const action = {
        method: { name: "nonExistentMethod" },
      };
      const settings = {};

      expect(() => {
        readActionArguments(action, settings);
      }).toThrowError("Could not find a method \"nonExistentMethod\" in config.json");
    });

    it("should parse parameters accordingly to the config", () => {
      const action = {
        method: { name: "testMethodOne" },
        params: {
          testParameterOne: "test",
          testParameterTwo: "1",
          testParameterThree: { id: "autocomplete-item-1", value: "Autocomplete 1" },
        },
      };
      const settings = {};

      const readArguments = readActionArguments(action, settings);

      expect(readArguments.testParameterOne).toStrictEqual("test");
      expect(readArguments.testParameterTwo).toEqual(1);
      expect(readArguments.testParameterThree).toStrictEqual("autocomplete-item-1");
    });

    it("should use settings if parameters are missing", () => {
      const action = {
        method: { name: "testMethodTwo" },
        params: {
          testParameterFour: null,
        },
      };
      const settings = {
        testParameterFour: "settings-test",
      };

      const readArguments = readActionArguments(action, settings);

      expect(readArguments.testParameterFour).toStrictEqual("settings-test");
    });

    it("should use defaultValue if parameters and settings are missing", () => {
      const action = {
        method: { name: "testMethodThree" },
        params: {
          testParameterFive: null,
        },
      };
      const settings = {
        testParameterFive: null,
      };

      const readArguments = readActionArguments(action, settings);

      expect(readArguments.testParameterFive).toStrictEqual("line-1\nline-2");
    });
  });
});
