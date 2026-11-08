/* eslint-disable @typescript-eslint/no-require-imports -- Shared CommonJS config for Next.js and the script/test runners. */
const { loadEnvConfig } = require("@next/env");
const { resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "../..");

function loadRootEnv() {
  // Next.js initially checks the app directory. Reload from the repository root
  // while preserving variables explicitly supplied by the shell or test runner.
  return loadEnvConfig(repositoryRoot, process.env.NODE_ENV === "development", console, true);
}

module.exports = { loadRootEnv };
