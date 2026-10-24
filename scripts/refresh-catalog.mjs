#!/usr/bin/env node
// Regenerates src/mcp/rea-tools.generated.json from the live REA MCP server.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, "src", "mcp", "rea-tools.generated.json");

const command = process.env.REA_COMMAND ?? "npx";
const args = process.env.REA_ARGS ? process.env.REA_ARGS.split(/\s+/) : ["-y", "rea-agents@latest", "--mcp"];

const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });

let buffer = "";
let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const entry = pending.get(message.id);
    if (!entry) continue;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  }
});

const timeout = setTimeout(() => {
  console.error("Timed out waiting for REA MCP server");
  child.kill();
  process.exit(1);
}, 120_000);

try {
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "rea-catalog-refresh", version: "1.0.0" },
  });
  notify("notifications/initialized", {});

  const tools = [];
  let cursor;
  do {
    const page = await send("tools/list", cursor ? { cursor } : {});
    tools.push(...(page.tools ?? []));
    cursor = page.nextCursor;
  } while (cursor);

  const slim = tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  await writeFile(outputPath, JSON.stringify(slim), "utf8");
  console.log(`Wrote ${slim.length} tools to ${outputPath}`);
} finally {
  clearTimeout(timeout);
  child.stdin.end();
  child.kill();
}
