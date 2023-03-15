const calculateStringEntropy = require("fast-password-entropy");

const consts = require("./consts.json");

const REDACTION_HANDLERS = [
  [(value) => value instanceof Error, redactSecretsInError],
];

function redactSecrets(input, secrets) {
  const complexSecrets = secrets.filter((secret) => (
    secret.length > 8 || calculateStringEntropy(secret) > consts.ENTROPY_THRESHOLDS[secret.length]
  ));

  const [, handleRedaction] = REDACTION_HANDLERS.find(
    ([predicateFunction]) => predicateFunction(input),
  ) ?? [null, redactSecretsWithStringify];

  return handleRedaction(input, complexSecrets);
}

function createRedactedLogger(secrets) {
  const createRedactedMethod = (originalFunction) => (...args) => {
    const redactedArgs = args.map((arg) => redactSecrets(arg, secrets));
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

function redactSecretsInError(error, secrets) {
  const redactedError = redactSecretsWithStringify(error, secrets);
  const redactedMessage = redactSecrets(error.message ?? "", secrets);

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

async function getVaultedParameters(params, methodDefinition) {
  const vaultParams = Object.entries(params).filter(([paramName]) => methodDefinition.params.some(
    (paramDefinition) => paramDefinition.type === "vault" && paramDefinition.name === paramName,
  ));
  return Object.fromEntries(vaultParams);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  getVaultedParameters,
  redactSecrets,
  createRedactedLogger,
};
