const autocomplete = require("./autocomplete");
const helpers = require("./helpers");
const docker = require("./docker");
const parsers = require("./parsers");
const core = require("./core");

module.exports = {
  ...core,
  helpers,
  parsers,
  autocomplete,
  docker,
};
