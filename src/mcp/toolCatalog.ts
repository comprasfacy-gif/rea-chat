import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpToolDefinition } from "./stdioClient.js";

const here = dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = join(here, "rea-tools.generated.json");

/** Upper bound for parameters rendered inline in help output. */
export const MAX_INLINE_OPTIONS = 25;

export interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  description: string;
  required: boolean;
  enumValues?: string[];
  defaultValue?: string | number | boolean;
}

export interface CatalogEntry {
  name: string;
  title: string;
  description: string;
  group: string;
  params: ToolParam[];
  hasParams: boolean;
  /** True when the schema uses constructs we cannot express as inline flags. */
  complexSchema: boolean;
}

interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  additionalProperties?: unknown;
  minLength?: number;
  pattern?: string;
  const?: unknown;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: unknown;
}

function schemaPropertyToParam(name: string, property: JsonSchemaProperty, required: boolean): ToolParam | null {
  const description = (property.description ?? "").replace(/\s+/g, " ").slice(0, 100);

  const enumValues = collectEnum(property);
  if (enumValues && enumValues.length > 0) {
    return {
      name,
      type: "enum",
      description: description || `Allowed: ${enumValues.join(", ")}`,
      required,
      enumValues,
      defaultValue: typeof property.default === "string" ? property.default : undefined,
    };
  }

  const type = Array.isArray(property.type) ? property.type.find((entry) => entry !== "null") : property.type;

  if (type === "boolean") {
    return {
      name,
      type: "boolean",
      description: description || "true or false",
      required,
      defaultValue: typeof property.default === "boolean" ? property.default : undefined,
    };
  }

  if (type === "number" || type === "integer") {
    return {
      name,
      type: "number",
      description: description || "Numeric value",
      required,
      defaultValue: typeof property.default === "number" ? property.default : undefined,
    };
  }

  if (type === "string") {
    return {
      name,
      type: "string",
      description: description || "Text value",
      required,
      defaultValue: typeof property.default === "string" ? property.default : undefined,
    };
  }

  return null;
}

function collectEnum(property: JsonSchemaProperty): string[] | undefined {
  if (Array.isArray(property.enum)) {
    const values = property.enum.filter((entry): entry is string => typeof entry === "string");
    if (values.length === property.enum.length) return values;
    return undefined;
  }
  if (typeof property.const === "string") return [property.const];

  const branches = property.anyOf ?? property.oneOf;
  if (branches) {
    for (const branch of branches) {
      const values = collectEnum(branch);
      if (values) return values;
    }
  }
  return undefined;
}

function hasComplexConstruct(property: JsonSchemaProperty): boolean {
  if (property.type === "object" || property.type === "array") return true;
  if (property.properties || property.items) return true;
  if (property.additionalProperties !== undefined && property.additionalProperties !== false) return true;
  if (property.anyOf?.some((branch) => branch.type === "object" || branch.type === "array")) return true;
  if (property.oneOf?.some((branch) => branch.type === "object" || branch.type === "array")) return true;
  return false;
}

function groupOf(name: string): string {
  const prefix = name.split("_")[0];
  return prefix && prefix.length > 0 ? prefix : "rea";
}

export function buildCatalog(tools: McpToolDefinition[]): CatalogEntry[] {
  return tools.map((tool) => {
    const schema = (tool.inputSchema ?? {}) as JsonSchema;
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);

    const params: ToolParam[] = [];
    let complexSchema = false;

    for (const [name, property] of Object.entries(properties)) {
      if (hasComplexConstruct(property)) {
        complexSchema = true;
        continue;
      }
      const param = schemaPropertyToParam(name, property, required.has(name));
      if (param) params.push(param);
      else complexSchema = true;
    }

    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
      complexSchema = true;
    }

    return {
      name: tool.name,
      title: tool.title ?? tool.name,
      description: tool.description ?? "",
      group: groupOf(tool.name),
      params,
      hasParams: params.length > 0,
      complexSchema,
    };
  });
}

export function loadGeneratedCatalog(): CatalogEntry[] {
  const raw = readFileSync(GENERATED_PATH, "utf8");
  const tools = JSON.parse(raw) as McpToolDefinition[];
  return buildCatalog(tools);
}
