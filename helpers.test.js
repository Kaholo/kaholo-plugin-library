const util = require("util");
const exec = util.promisify(require("child_process").exec);
const { open } = require("fs/promises");

const helpers = require("./helpers");

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
});

describe("extractPathsFromCommand", () => {
  it("should extract all paths", () => {
    const commandString = "mkdir /tmp/dir /tmp/dir2/";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].argument).toMatch("/tmp/dir");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2/");
    expect(extractedPaths[1].argument).toMatch("/tmp/dir2/");
  });

  it("should extract all paths wrapped with \"", () => {
    const commandString = "mkdir \"/tmp/dir\" -p=\"/tmp/dir2\"";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].argument).toMatch("\"/tmp/dir\"");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2");
    expect(extractedPaths[1].argument).toMatch("\"/tmp/dir2\"");
  });

  it("should extract all paths wrapped with '", () => {
    const commandString = "mkdir -p='/tmp/dir' -p='/tmp/dir2'";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/tmp/dir");
    expect(extractedPaths[0].argument).toMatch("'/tmp/dir'");

    expect(extractedPaths[1].path).toMatch("/tmp/dir2");
    expect(extractedPaths[1].argument).toMatch("'/tmp/dir2'");
  });

  it("should extract paths starting with file(b)://", () => {
    const commandString = "somecmd -p file:///path/to/the/file -r=fileb://some-directory/file";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/path/to/the/file");
    expect(extractedPaths[0].argument).toMatch("file:///path/to/the/file");

    expect(extractedPaths[1].path).toMatch("some-directory/file");
    expect(extractedPaths[1].argument).toMatch("fileb://some-directory/file");
  });

  it("should extract paths starting with file(b):// wrapped with \"", () => {
    const commandString = "somecmd -p=\"fileb:///path/to the/file\" -r \"file://relative path/to the/file\"";
    const extractedPaths = helpers.extractPathsFromCommand(commandString);

    expect(extractedPaths[0].path).toMatch("/path/to the/file");
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
    expect(extractedPaths[1].argument).toMatch("'file://relative path/to the/file'");
  });
});