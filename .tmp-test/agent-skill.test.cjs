var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/shared/agent-skill.test.ts
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));

// src/shared/agent-skill.ts
var DEFAULT_SKILL_TOOL_PERMISSIONS = {
  file_read: true,
  file_write: true,
  command_run: false,
  clipboard_access: false,
  browser_action: false,
  send_messages: true
};
function splitFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: "", body: content };
  }
  return { frontmatter: match[1], body: match[2] };
}
function stripYamlValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function parseYamlScalar(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "yes" || lower === "enabled") return true;
  if (lower === "false" || lower === "no" || lower === "disabled") return false;
  if (lower === "null" || lower === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseYamlScalar(item.trim())).filter((item) => item !== void 0);
  }
  return stripYamlValue(value);
}
function parseYamlObject(frontmatter) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const lines = frontmatter.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^(\s*)([^:#]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2].trim();
    const rawValue = (match[3] ?? "").trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;
    if (!rawValue) {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
      continue;
    }
    parent[key] = parseYamlScalar(rawValue);
  }
  return root;
}
function getYamlPath(root, ...path) {
  let cursor = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return void 0;
    cursor = cursor[segment];
  }
  return cursor;
}
function yamlStringAt(root, ...path) {
  const value = getYamlPath(root, ...path);
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function yamlBooleanAt(root, ...path) {
  const value = getYamlPath(root, ...path);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "enabled") return true;
    if (normalized === "false" || normalized === "no" || normalized === "disabled") return false;
  }
  return void 0;
}
function yamlQuoted(value) {
  return JSON.stringify(value);
}
function parseAgentSkillContent(content, fallbackName = "agent") {
  const { frontmatter, body } = splitFrontmatter(content);
  const yamlRoot = parseYamlObject(frontmatter);
  const statusRaw = (yamlStringAt(yamlRoot, "status") ?? yamlStringAt(yamlRoot, "metadata", "openclaw", "status") ?? "active").toLowerCase();
  const status = statusRaw === "disabled" || statusRaw === "false" ? "disabled" : "active";
  const toolPermissions = {
    file_read: yamlBooleanAt(yamlRoot, "file_read") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "file_read") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.file_read,
    file_write: yamlBooleanAt(yamlRoot, "file_write") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "file_write") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.file_write,
    command_run: yamlBooleanAt(yamlRoot, "command_run") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "command_run") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.command_run,
    clipboard_access: yamlBooleanAt(yamlRoot, "clipboard_access") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "clipboard_access") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.clipboard_access,
    browser_action: yamlBooleanAt(yamlRoot, "browser_action") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "browser_action") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.browser_action,
    send_messages: yamlBooleanAt(yamlRoot, "send_messages") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "toolPermissions", "send_messages") ?? DEFAULT_SKILL_TOOL_PERMISSIONS.send_messages
  };
  return {
    name: yamlStringAt(yamlRoot, "name") ?? fallbackName,
    description: yamlStringAt(yamlRoot, "description") ?? "",
    emoji: yamlStringAt(yamlRoot, "emoji") ?? yamlStringAt(yamlRoot, "metadata", "openclaw", "emoji") ?? "\u{1F916}",
    model: yamlStringAt(yamlRoot, "model") ?? yamlStringAt(yamlRoot, "metadata", "openclaw", "model") ?? "",
    status,
    systemPrompt: body.trim() || "# Instructions\n\nDefine how this agent should behave.",
    toolPermissions,
    workspaceRoot: yamlStringAt(yamlRoot, "root") ?? yamlStringAt(yamlRoot, "metadata", "openclaw", "workspace", "root") ?? ".",
    sessionLabel: yamlStringAt(yamlRoot, "sessionLabel") ?? yamlStringAt(yamlRoot, "metadata", "openclaw", "workspace", "sessionLabel") ?? fallbackName,
    includeMemory: yamlBooleanAt(yamlRoot, "includeMemory") ?? yamlBooleanAt(yamlRoot, "metadata", "openclaw", "workspace", "includeMemory") ?? true
  };
}
function buildAgentSkillMarkdown(skill) {
  const description = skill.description.trim() || `${skill.name} agent`;
  const model = skill.model.trim() || "openclaw:main";
  const root = skill.workspaceRoot.trim() || ".";
  const sessionLabel = skill.sessionLabel.trim() || skill.name;
  const prompt = skill.systemPrompt.trim() || "# Instructions\n\nDescribe this agent behavior.";
  return `---
name: ${yamlQuoted(skill.name)}
description: ${yamlQuoted(description)}
metadata:
  openclaw:
    emoji: ${yamlQuoted(skill.emoji || "\u{1F916}")}
    model: ${yamlQuoted(model)}
    status: ${yamlQuoted(skill.status)}
    toolPermissions:
      file_read: ${skill.toolPermissions.file_read}
      file_write: ${skill.toolPermissions.file_write}
      command_run: ${skill.toolPermissions.command_run}
      clipboard_access: ${skill.toolPermissions.clipboard_access}
      browser_action: ${skill.toolPermissions.browser_action}
      send_messages: ${skill.toolPermissions.send_messages}
    workspace:
      root: ${yamlQuoted(root)}
      includeMemory: ${skill.includeMemory}
      sessionLabel: ${yamlQuoted(sessionLabel)}
---
${prompt}
`;
}

// src/shared/agent-skill.test.ts
(0, import_node_test.default)("agent skill metadata.openclaw round-trip preserves key fields", () => {
  const input = {
    name: "research-agent",
    description: "Researches topics. Use when user asks for research or source comparison.",
    emoji: "\u{1F50D}",
    model: "anthropic/claude-opus-4-6",
    status: "active",
    systemPrompt: "# Instructions\n\n1. Search\n2. Synthesize",
    toolPermissions: {
      file_read: true,
      file_write: true,
      command_run: false,
      clipboard_access: false,
      browser_action: true,
      send_messages: false
    },
    workspaceRoot: ".",
    sessionLabel: "research-topic",
    includeMemory: true
  };
  const markdown = buildAgentSkillMarkdown(input);
  const parsed = parseAgentSkillContent(markdown, "fallback");
  import_strict.default.equal(parsed.name, input.name);
  import_strict.default.equal(parsed.description, input.description);
  import_strict.default.equal(parsed.emoji, input.emoji);
  import_strict.default.equal(parsed.model, input.model);
  import_strict.default.equal(parsed.status, input.status);
  import_strict.default.equal(parsed.workspaceRoot, input.workspaceRoot);
  import_strict.default.equal(parsed.sessionLabel, input.sessionLabel);
  import_strict.default.equal(parsed.includeMemory, input.includeMemory);
  import_strict.default.deepEqual(parsed.toolPermissions, input.toolPermissions);
});
(0, import_node_test.default)("parser supports legacy top-level fields and metadata.openclaw fields", () => {
  const skill = `---
name: "legacy-agent"
description: "Legacy parser compatibility. Use when editing old skills."
emoji: "\u{1F9EA}"
model: "openai/gpt-5.2"
status: "disabled"
file_read: true
file_write: false
command_run: true
clipboard_access: true
browser_action: false
send_messages: false
root: "workspace/ops"
includeMemory: false
sessionLabel: "legacy-label"
---
# Instructions

Test legacy fields.
`;
  const parsed = parseAgentSkillContent(skill, "fallback");
  import_strict.default.equal(parsed.name, "legacy-agent");
  import_strict.default.equal(parsed.emoji, "\u{1F9EA}");
  import_strict.default.equal(parsed.model, "openai/gpt-5.2");
  import_strict.default.equal(parsed.status, "disabled");
  import_strict.default.equal(parsed.workspaceRoot, "workspace/ops");
  import_strict.default.equal(parsed.includeMemory, false);
  import_strict.default.equal(parsed.sessionLabel, "legacy-label");
  import_strict.default.equal(parsed.toolPermissions.command_run, true);
  import_strict.default.equal(parsed.toolPermissions.file_write, false);
});
