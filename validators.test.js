const {
  resolveValidationFunction,
  MissingLineFeedError,
} = require("./validators");

/* eslint-disable quotes */

describe("validators", () => {
  describe("shKey", () => {
    const sshKeyValidator = resolveValidationFunction("ssh");

    it("should fail if the line feed is missing", () => {
      const sshKey = `\
-----BEGIN OPENSSH PRIVATE KEY-----\n\
asdasdasdasasd\n\
-----END OPENSSH PRIVATE KEY-----\
`;

      const failingCall = () => sshKeyValidator(sshKey);

      expect(failingCall)
        .toThrow("Missing line feed character at the end of the file.");
      expect(failingCall).toThrow(MissingLineFeedError);
    });

    it("should fail if the key lacks beginning designation", () => {
      const sshKey = `\
asdasdasdasasd\n\
-----END OPENSSH PRIVATE KEY-----\n\
`;

      expect(() => sshKeyValidator(sshKey))
        .toThrow("Missing key beginning designation.");
    });

    it("should fail if the key lacks end designation", () => {
      const sshKey = `\
-----BEGIN OPENSSH PRIVATE KEY-----\n\
asdasdasdasasd\n\
`;

      expect(() => sshKeyValidator(sshKey))
        .toThrow("Missing key end designation.");
    });

    it("should validate key succesfully", () => {
      const sshKey = `\
-----BEGIN OPENSSH PRIVATE KEY-----\n\
asdasdasdasasd\n\
-----END OPENSSH PRIVATE KEY-----\n\
`;

      const result = sshKeyValidator(sshKey);

      expect(result).toBe(true);
    });
  });
});

/* eslint-enable quotes */
