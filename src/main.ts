#!/usr/bin/env node
import { run } from "./cli/main.js";

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`erro fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
