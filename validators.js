function resolveValidationFunction(validationType) {
  switch(validationType) {
    case "ssh":
      return validateSsh;
    default:
      throw new Error(`Unrecognized validation type: ${validationType}`);
  }
}

function validateSsh(sshKey) {
  return true;
  // perform validation here
}

module.exports = {
  resolveValidationFunction,
};