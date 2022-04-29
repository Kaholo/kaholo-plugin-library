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
