const _ = require("lodash");
const calculateStringEntropy = require("fast-password-entropy");

const consts = require("./consts.json");

const REDACTION_HANDLERS = [
  [_.isError, redactSecretsInError],
  [_.isArray, redactSecretsInArray],
  [_.isPlainObject, redactSecretsInPlainObject],
  [_.isNull, () => null],
  [_.isUndefined, () => undefined],
];

function createRedactedLogger(secrets) {
  const createRedactedMethod = (originalFunction) => (...args) => {
    const redactedArgs = args.map((arg) => redactFilteredSecrets(arg, secrets));
    return originalFunction(...redactedArgs);
  };

  const logger = Object.create(console, {
    info: { value: createRedactedMethod(console.info.bind(console)) },
    // eslint-disable-next-line no-console
    log: { value: createRedactedMethod(console.log.bind(console)) },
    error: { value: createRedactedMethod(console.error.bind(console)) },
    warn: { value: createRedactedMethod(console.warn.bind(console)) },
  });

  return logger;
}

function redactSecrets(input, secrets) {
  const complexSecrets = secrets.filter((secret) => (
    secret.length > 8 || calculateStringEntropy(secret) > consts.ENTROPY_THRESHOLDS[secret.length]
  ));

  return redactFilteredSecrets(input, complexSecrets);
}

function redactFilteredSecrets(input, secrets) {
  const [, handleRedaction] = (
    REDACTION_HANDLERS.find(([predicateFunction]) => predicateFunction(input))
  ) ?? [null, redactSecretsWithStringify];

  return handleRedaction(input, secrets);
}

function redactSecretsInError(error, secrets) {
  const redactedError = redactSecretsWithStringify(error, secrets);
  const redactedMessage = redactFilteredSecrets(error.message ?? "", secrets);

  return Object.assign(
    new Error(redactedMessage),
    redactedError,
  );
}

function redactSecretsWithStringify(input, secrets) {
  const stringifiedInput = JSON.stringify(input);
  const redactedInput = secrets.reduce((acc, cur) => (
    acc.replace(
      new RegExp(escapeRegExp(JSON.stringify(cur).slice(1, -1)), "gm"),
      consts.REDACTED_PLACEHOLDER,
    )
  ), stringifiedInput);

  return JSON.parse(redactedInput);
}

function redactSecretsInArray(input, secrets) {
  return input.map(
    (arrayElement) => redactFilteredSecrets(arrayElement, secrets),
  );
}

function redactSecretsInPlainObject(input, secrets) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      redactFilteredSecrets(key, secrets),
      redactFilteredSecrets(value, secrets),
    ]),
  );
}

function filterVaultedParameters(params, paramsDefinition) {
  const vaultParams = Object.entries(params).filter(([paramName]) => paramsDefinition.some(
    (paramDefinition) => paramDefinition.type === "vault" && paramDefinition.name === paramName,
  ));
  return Object.fromEntries(vaultParams);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  filterVaultedParameters,
  redactSecrets,
  createRedactedLogger,
};
