import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, readJsonArgs } from "../src/cli/args.js";
import { buildToolArgs } from "../src/cli/session.js";
import { renderToolResult } from "../src/cli/render.js";
import { loadGeneratedCatalog } from "../src/mcp/toolCatalog.js";

test("catalog loads every REA tool", () => {
  const catalog = loadGeneratedCatalog();
  assert.ok(catalog.length >= 200, `expected at least 200 tools, got ${catalog.length}`);
  assert.ok(catalog.some((entry) => entry.name === "open_binary"));
  for (const entry of catalog) assert.ok(entry.group.length > 0, `${entry.name} has no group`);
});

test("parseArgs separates tool, flags, switches and positionals", () => {
  const parsed = parseArgs(["open_binary", "--path", "C:\\targets\\app.exe", "--verbose", "--", "extra"]);
  assert.equal(parsed.tool, "open_binary");
  assert.equal(parsed.flags.path, "C:\\targets\\app.exe");
  assert.ok(parsed.switches.has("verbose"));
  assert.deepEqual(parsed.positional, ["extra"]);
});

test("parseArgs binds a following token as a flag value", () => {
  const parsed = parseArgs(["open_binary", "--path", "app.exe"]);
  assert.equal(parsed.flags.path, "app.exe");
  assert.equal(parsed.switches.size, 0);
});

test("parseArgs handles compact flags and subcommands", () => {
  const parsed = parseArgs(["list", "inspect"]);
  assert.equal(parsed.list, true);
  assert.equal(parsed.tool, "inspect");

  const compact = parseArgs(["list_strings", "--limit=50"]);
  assert.equal(compact.flags.limit, "50");
});

test("readJsonArgs rejects non-objects", () => {
  assert.throws(() => readJsonArgs(parseArgs(["x", "--json", "[1,2]"])));
  assert.deepEqual(readJsonArgs(parseArgs(["x", "--json", '{"a":1}'])), { a: 1 });
});

test("buildToolArgs coerces types and fills positionals", () => {
  const entry = loadGeneratedCatalog().find((candidate) => candidate.name === "list_strings");
  assert.ok(entry, "list_strings must exist in the catalog");

  const numeric = entry.params.find((param) => param.type === "number");
  const flagName = numeric?.name ?? entry.params[0]?.name;
  assert.ok(flagName, "list_strings should have at least one param");

  const built = buildToolArgs(entry, { [flagName]: "42" }, new Set(), []);
  if (numeric) assert.equal(built.args[flagName], 42);
  assert.equal(built.notes.filter((note) => note.startsWith("parâmetro obrigatório ausente")).length, 0);
});

test("buildToolArgs reports unknown flags instead of failing", () => {
  const entry = loadGeneratedCatalog().find((candidate) => candidate.name === "binary_session");
  assert.ok(entry);
  const built = buildToolArgs(entry, { nope: "1" }, new Set(), []);
  assert.ok(built.notes.some((note) => note.includes("flag desconhecida")));
});

test("renderToolResult prefers structured content", () => {
  const rendered = renderToolResult({ structuredContent: { ok: true } });
  assert.equal(rendered.isError, false);
  assert.match(rendered.text, /"ok": true/);

  const text = renderToolResult({ content: [{ type: "text", text: "hello" }] });
  assert.equal(text.text, "hello");

  const error = renderToolResult({ isError: true, content: [{ type: "text", text: "boom" }] });
  assert.equal(error.isError, true);
});
