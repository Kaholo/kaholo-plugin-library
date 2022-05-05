const os = require("os");

const LOCAL_LINE_FEED = os.EOL;

class MissingLineFeedError extends Error {}

function resolveValidationFunction(validationType) {
  switch (validationType) {
    case "ssh":
      return validateSsh;
    default:
      throw new Error(`Unrecognized validation type: ${validationType}`);
  }
}

function validateSsh(sshKey) {
  if (!sshKey.endsWith(LOCAL_LINE_FEED)) {
    throw new MissingLineFeedError("Missing line feed character at the end of the file.");
  }

  const beginKeyRegexp = /^-----BEGIN [\w\s]{1,50} KEY-----\n/;
  if (!beginKeyRegexp.test(sshKey)) {
    throw new Error("Missing key beginning designation.");
  }

  const endKeyRegexp = /-----END [\w\s]{1,50} KEY-----\n\s*$/;
  if (!endKeyRegexp.test(sshKey)) {
    throw new Error("Missing key end designation.");
  }

  return true;
}

module.exports = {
  resolveValidationFunction,
  MissingLineFeedError,
};
