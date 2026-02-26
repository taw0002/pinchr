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

// src/main/topic-router.test.ts
var import_strict = __toESM(require("node:assert/strict"));
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var import_node_test = __toESM(require("node:test"));

// src/main/topic-router.ts
var import_fs = require("fs");
var import_path = require("path");
var TOPIC_ROUTES_FILENAME = "topic-sessions.json";
var TOPIC_MEMORY_DIR = "memory/topics";
var ROUTING_VERSION = 1;
var ROUTING_KEYWORD_LIMIT = 12;
var ROUTING_MIN_SCORE = 2;
var TOPIC_HISTORY_LIMIT = 80;
var MAIN_HISTORY_LIMIT = 40;
var TOPIC_MAX_MESSAGES = 120;
var TOPIC_MAX_APPROX_CHARS = 16e4;
var TOPIC_INACTIVE_ARCHIVE_DAYS = 7;
var TOPIC_MAX_PER_MAIN_SESSION = 32;
var TOPIC_ARCHIVE_DIR = "memory/topics/archive";
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "let",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "that",
  "the",
  "their",
  "there",
  "these",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
  "can",
  "could",
  "should",
  "would",
  "will",
  "about",
  "into",
  "just",
  "need",
  "needs",
  "also",
  "than",
  "then",
  "them",
  "they",
  "was",
  "were",
  "been",
  "do",
  "does",
  "did",
  "done"
]);
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
function readString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function readNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  const unique = /* @__PURE__ */ new Set();
  for (const item of value) {
    const text = readString(item);
    if (!text) continue;
    unique.add(text.toLowerCase());
  }
  return Array.from(unique);
}
function ensureDocShape(value) {
  const root = asRecord(value);
  if (!root) {
    return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() };
  }
  const rawTopics = Array.isArray(root.topics) ? root.topics : [];
  const topics = [];
  for (const entry of rawTopics) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = readString(row.id);
    const label = readString(row.label);
    const sessionKey = readString(row.sessionKey);
    const mainSessionKey = readString(row.mainSessionKey);
    if (!id || !label || !sessionKey || !mainSessionKey) continue;
    topics.push({
      id,
      label,
      sessionKey,
      mainSessionKey,
      keywords: toStringArray(row.keywords).slice(0, ROUTING_KEYWORD_LIMIT),
      createdAt: readString(row.createdAt) ?? nowIso(),
      lastActive: readString(row.lastActive) ?? nowIso(),
      messageCount: readNumber(row.messageCount) ?? 0,
      approxChars: readNumber(row.approxChars) ?? 0,
      summary: readString(row.summary),
      lastSummaryAt: readString(row.lastSummaryAt)
    });
  }
  return {
    version: ROUTING_VERSION,
    topics,
    updatedAt: readString(root.updatedAt) ?? nowIso()
  };
}
function readRoutingDoc(workspacePath) {
  const filePath = (0, import_path.join)(workspacePath, TOPIC_ROUTES_FILENAME);
  try {
    if (!(0, import_fs.existsSync)(filePath)) {
      return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() };
    }
    const raw = (0, import_fs.readFileSync)(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return ensureDocShape(parsed);
  } catch {
    return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() };
  }
}
function writeRoutingDoc(workspacePath, doc) {
  const filePath = (0, import_path.join)(workspacePath, TOPIC_ROUTES_FILENAME);
  const next = {
    ...doc,
    version: ROUTING_VERSION,
    updatedAt: nowIso()
  };
  (0, import_fs.writeFileSync)(filePath, JSON.stringify(next, null, 2));
}
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 48) || "topic";
}
function toTitleCase(value) {
  return value.split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}
function topKeywords(text, limit) {
  const counts = /* @__PURE__ */ new Map();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([token]) => token);
}
function deriveTopicLabel(message) {
  const keywords = topKeywords(message, 5);
  if (keywords.length === 0) return "General Topic";
  return toTitleCase(keywords.join(" "));
}
function scoreTopic(messageKeywords, topic) {
  const topicTokens = /* @__PURE__ */ new Set([...topic.keywords, ...tokenize(topic.label)]);
  let score = 0;
  for (const token of messageKeywords) {
    if (topicTokens.has(token)) score += 1;
  }
  return score;
}
function pickTopic(doc, mainSessionKey, message) {
  const messageTokens = new Set(topKeywords(message, ROUTING_KEYWORD_LIMIT));
  const candidates = doc.topics.filter((topic) => topic.mainSessionKey === mainSessionKey);
  if (candidates.length === 0 || messageTokens.size === 0) return { confidence: 0 };
  let best;
  let bestScore = 0;
  for (const topic of candidates) {
    const score = scoreTopic(messageTokens, topic);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  if (!best || bestScore < ROUTING_MIN_SCORE) return { confidence: 0 };
  return { topic: best, confidence: bestScore / Math.max(messageTokens.size, 1) };
}
function findSessionKey(value) {
  if (typeof value === "string") {
    if (value.startsWith("agent:")) return value;
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSessionKey(entry);
      if (found) return found;
    }
    return null;
  }
  const root = asRecord(value);
  if (!root) return null;
  const directCandidates = [
    root.sessionKey,
    root.childSessionKey,
    root.child_session_key,
    root.key,
    root.session_id,
    root.sessionId
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.startsWith("agent:")) return candidate;
  }
  for (const nestedKey of ["data", "result", "details", "session", "child"]) {
    const found = findSessionKey(root[nestedKey]);
    if (found) return found;
  }
  return null;
}
function extractTextFromUnknown(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => extractTextFromUnknown(entry)).join("\n").trim();
  }
  const root = asRecord(value);
  if (!root) return "";
  const direct = [root.text, root.content, root.value, root.summary].map((entry) => typeof entry === "string" ? entry : "").filter(Boolean).join("\n").trim();
  if (direct) return direct;
  const nestedKeys = ["message", "messages", "data", "result", "details", "response", "announce"];
  for (const key of nestedKeys) {
    const text = extractTextFromUnknown(root[key]);
    if (text) return text;
  }
  return "";
}
function normalizeHistoryMessages(payload) {
  const root = asRecord(payload);
  const entries = Array.isArray(root?.messages) ? root.messages : Array.isArray(payload) ? payload : [];
  const messages = [];
  for (const entry of entries) {
    const row = asRecord(entry);
    if (!row) continue;
    const role = readString(row.role) ?? "system";
    const content = extractTextFromUnknown(row.content);
    if (!content.trim()) continue;
    messages.push({ role, content: content.trim() });
  }
  return messages;
}
async function getHistory(invokeTool, sessionKey, limit) {
  const history = await invokeTool("sessions_history", { sessionKey, limit }, sessionKey);
  return normalizeHistoryMessages(history);
}
async function spawnTopicSession(invokeTool, mainSessionKey, label, topicId) {
  const task = [
    `Create or resume a focused sub-session for topic "${label}".`,
    "Keep this thread scoped tightly to the topic and preserve important decisions.",
    "Do not announce setup details; only report final task output when asked."
  ].join(" ");
  const spawnResult = await invokeTool(
    "sessions_spawn",
    {
      task,
      mode: "subagent",
      cleanup: "keep",
      runTimeoutSeconds: 20,
      noAnnounce: true,
      metadata: {
        topicId,
        topicLabel: label
      }
    },
    mainSessionKey
  );
  const childSessionKey = findSessionKey(spawnResult);
  if (!childSessionKey) {
    throw new Error(`sessions_spawn succeeded without a child session key for topic "${label}"`);
  }
  return childSessionKey;
}
function extractLatestAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    if (entry.role === "assistant" && entry.content.trim()) {
      return entry.content.trim();
    }
  }
  return "";
}
function appendTopicSummary(workspacePath, topic, summary) {
  if (!summary.trim()) return;
  const dirPath = (0, import_path.join)(workspacePath, TOPIC_MEMORY_DIR);
  if (!(0, import_fs.existsSync)(dirPath)) {
    (0, import_fs.mkdirSync)(dirPath, { recursive: true });
  }
  const memoryPath = (0, import_path.join)(dirPath, `${topic.id}.md`);
  const heading = `## ${(/* @__PURE__ */ new Date()).toISOString()}`;
  const body = [heading, `Session: ${topic.sessionKey}`, "", summary.trim(), ""].join("\n");
  const existing = (0, import_fs.existsSync)(memoryPath) ? (0, import_fs.readFileSync)(memoryPath, "utf-8") : "";
  const next = existing.trim() ? `${existing.trim()}

${body}` : `${body}
`;
  (0, import_fs.writeFileSync)(memoryPath, next);
}
function parseIsoToMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function appendTopicArchiveEntry(workspacePath, topic, reason) {
  const archiveDirPath = (0, import_path.join)(workspacePath, TOPIC_ARCHIVE_DIR);
  if (!(0, import_fs.existsSync)(archiveDirPath)) {
    (0, import_fs.mkdirSync)(archiveDirPath, { recursive: true });
  }
  const archivePath = (0, import_path.join)(archiveDirPath, `${topic.id}.md`);
  const heading = `## ${nowIso()}`;
  const summary = topic.summary?.trim() ? topic.summary.trim() : "_No summary captured._";
  const body = [
    heading,
    `Reason: ${reason}`,
    `Label: ${topic.label}`,
    `Topic ID: ${topic.id}`,
    `Session: ${topic.sessionKey}`,
    `Main Session: ${topic.mainSessionKey}`,
    `Last Active: ${topic.lastActive}`,
    "",
    summary,
    ""
  ].join("\n");
  const existing = (0, import_fs.existsSync)(archivePath) ? (0, import_fs.readFileSync)(archivePath, "utf-8").trim() : "";
  const next = existing ? `${existing}

${body}` : `${body}
`;
  (0, import_fs.writeFileSync)(archivePath, next);
}
function cleanupTopicLifecycle(workspacePath, doc, mainSessionKey) {
  const actions = [];
  const cutoffMs = Date.now() - TOPIC_INACTIVE_ARCHIVE_DAYS * 24 * 60 * 60 * 1e3;
  const removedTopicIds = /* @__PURE__ */ new Set();
  for (const topic of doc.topics) {
    if (topic.mainSessionKey !== mainSessionKey) continue;
    const lastActiveMs = parseIsoToMs(topic.lastActive);
    if (lastActiveMs > 0 && lastActiveMs < cutoffMs) {
      removedTopicIds.add(topic.id);
      appendTopicArchiveEntry(workspacePath, topic, "inactive");
      actions.push(`Archived inactive topic "${topic.label}"`);
    }
  }
  if (removedTopicIds.size > 0) {
    doc.topics = doc.topics.filter((topic) => !removedTopicIds.has(topic.id));
  }
  const mainTopics = doc.topics.filter((topic) => topic.mainSessionKey === mainSessionKey);
  if (mainTopics.length > TOPIC_MAX_PER_MAIN_SESSION) {
    const overflow = mainTopics.slice().sort((a, b) => parseIsoToMs(a.lastActive) - parseIsoToMs(b.lastActive)).slice(0, mainTopics.length - TOPIC_MAX_PER_MAIN_SESSION);
    for (const topic of overflow) {
      removedTopicIds.add(topic.id);
      appendTopicArchiveEntry(workspacePath, topic, "overflow");
      actions.push(`Archived overflow topic "${topic.label}"`);
    }
    doc.topics = doc.topics.filter((topic) => !removedTopicIds.has(topic.id));
  }
  return actions;
}
async function maybeCompactTopic(invokeTool, workspacePath, mainSessionKey, topic) {
  if (topic.messageCount < TOPIC_MAX_MESSAGES && topic.approxChars < TOPIC_MAX_APPROX_CHARS) return;
  const summarizePrompt = [
    "Provide a concise persistent summary for this topic session.",
    "Include:",
    "1) decisions made",
    "2) open issues",
    "3) important constraints",
    "4) next concrete actions",
    "Keep it under 220 words."
  ].join("\n");
  let summary = "";
  try {
    const summarizeResult = await invokeTool(
      "sessions_send",
      {
        sessionKey: topic.sessionKey,
        message: summarizePrompt,
        timeoutSeconds: 90,
        noAnnounce: true
      },
      mainSessionKey
    );
    summary = extractTextFromUnknown(summarizeResult);
  } catch {
    summary = "";
  }
  if (!summary) {
    const topicHistory = await getHistory(invokeTool, topic.sessionKey, TOPIC_HISTORY_LIMIT);
    summary = extractLatestAssistantMessage(topicHistory);
  }
  if (!summary) return;
  topic.summary = summary;
  topic.lastSummaryAt = nowIso();
  topic.messageCount = 0;
  topic.approxChars = 0;
  appendTopicSummary(workspacePath, topic, summary);
}
async function routeMessageToTopicSession(options) {
  const { workspacePath, mainSessionKey, message, invokeTool } = options;
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Cannot route an empty message");
  }
  const doc = readRoutingDoc(workspacePath);
  const lifecycleActions = cleanupTopicLifecycle(workspacePath, doc, mainSessionKey);
  const beforeMainHistory = await getHistory(invokeTool, mainSessionKey, MAIN_HISTORY_LIMIT);
  const picked = pickTopic(doc, mainSessionKey, trimmedMessage);
  let topic = picked.topic;
  let created = false;
  let confidence = picked.confidence;
  if (!topic) {
    const label = deriveTopicLabel(trimmedMessage);
    const topicId = `${slugify(label)}-${Math.random().toString(36).slice(2, 7)}`;
    const sessionKey = await spawnTopicSession(invokeTool, mainSessionKey, label, topicId);
    topic = {
      id: topicId,
      label,
      sessionKey,
      mainSessionKey,
      keywords: topKeywords(trimmedMessage, ROUTING_KEYWORD_LIMIT),
      createdAt: nowIso(),
      lastActive: nowIso(),
      messageCount: 0,
      approxChars: 0
    };
    created = true;
    confidence = 1;
    doc.topics.push(topic);
  }
  const sendResult = await invokeTool(
    "sessions_send",
    {
      sessionKey: topic.sessionKey,
      message: trimmedMessage,
      timeoutSeconds: 120
    },
    mainSessionKey
  );
  let responseText = extractTextFromUnknown(sendResult);
  let responseSource = responseText ? "tool" : "fallback";
  if (!responseText) {
    const afterMainHistory = await getHistory(invokeTool, mainSessionKey, MAIN_HISTORY_LIMIT);
    const newMessages = afterMainHistory.slice(beforeMainHistory.length);
    responseText = extractLatestAssistantMessage(newMessages);
    if (responseText) responseSource = "main-history";
  }
  if (!responseText) {
    const topicHistory = await getHistory(invokeTool, topic.sessionKey, TOPIC_HISTORY_LIMIT);
    responseText = extractLatestAssistantMessage(topicHistory);
    if (responseText) responseSource = "topic-history";
  }
  if (!responseText) {
    responseText = "Routed to topic session. No assistant text was returned yet.";
    responseSource = "fallback";
  }
  topic.lastActive = nowIso();
  topic.messageCount += 1;
  topic.approxChars += trimmedMessage.length + responseText.length;
  topic.keywords = Array.from(
    /* @__PURE__ */ new Set([...topic.keywords, ...topKeywords(trimmedMessage, 6)])
  ).slice(0, ROUTING_KEYWORD_LIMIT);
  await maybeCompactTopic(invokeTool, workspacePath, mainSessionKey, topic);
  writeRoutingDoc(workspacePath, doc);
  const decisions = [
    created ? `Created new topic thread "${topic.label}" and routed message there.` : `Routed message to existing topic "${topic.label}".`,
    `Primary execution session: ${topic.sessionKey}`
  ];
  const nextActions = lifecycleActions;
  return {
    route: {
      topicId: topic.id,
      topicLabel: topic.label,
      sessionKey: topic.sessionKey,
      created,
      confidence
    },
    response: {
      text: responseText,
      source: responseSource
    },
    envelope: {
      topic_id: topic.id,
      topic_label: topic.label,
      session_key: topic.sessionKey,
      confidence,
      decisions,
      next_actions: nextActions
    }
  };
}

// src/main/topic-router.test.ts
function createWorkspace() {
  const workspacePath = (0, import_node_fs.mkdtempSync)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "topic-router-"));
  return {
    workspacePath,
    cleanup: () => (0, import_node_fs.rmSync)(workspacePath, { recursive: true, force: true })
  };
}
function readTopicDoc(workspacePath) {
  const filePath = (0, import_node_path.join)(workspacePath, "topic-sessions.json");
  const parsed = JSON.parse((0, import_node_fs.readFileSync)(filePath, "utf-8"));
  return parsed;
}
(0, import_node_test.default)("routes follow-up messages into the same topic session", async () => {
  const { workspacePath, cleanup } = createWorkspace();
  const mainSessionKey = "agent:main:test-session";
  const topicSessionKey = "agent:sub:topic-1";
  const topicHistory = [];
  let spawnCalls = 0;
  const invokeTool = async (tool, args) => {
    if (tool === "sessions_history") {
      const sessionKey = String(args?.sessionKey || "");
      if (sessionKey === mainSessionKey) {
        return { messages: [] };
      }
      if (sessionKey === topicSessionKey) {
        return { messages: topicHistory };
      }
      return { messages: [] };
    }
    if (tool === "sessions_spawn") {
      spawnCalls += 1;
      return { sessionKey: topicSessionKey };
    }
    if (tool === "sessions_send") {
      const sessionKey = String(args?.sessionKey || "");
      const message = String(args?.message || "");
      if (sessionKey !== topicSessionKey) {
        throw new Error(`Unexpected session key: ${sessionKey}`);
      }
      const response = `Topic response: ${message}`;
      topicHistory.push({ role: "user", content: message });
      topicHistory.push({ role: "assistant", content: response });
      return { text: response };
    }
    throw new Error(`Unexpected tool: ${tool}`);
  };
  try {
    const first = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: "Fix sidebar button alignment in settings page",
      invokeTool
    });
    const second = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: "Sidebar button alignment still broken on mobile",
      invokeTool
    });
    import_strict.default.equal(first.route.created, true);
    import_strict.default.equal(second.route.created, false);
    import_strict.default.equal(second.route.sessionKey, first.route.sessionKey);
    import_strict.default.equal(spawnCalls, 1);
    const doc = readTopicDoc(workspacePath);
    import_strict.default.equal(doc.topics.length, 1);
  } finally {
    cleanup();
  }
});
(0, import_node_test.default)("archives stale topics before routing and records lifecycle actions", async () => {
  const { workspacePath, cleanup } = createWorkspace();
  const mainSessionKey = "agent:main:test-session";
  const staleTopicId = "stale-billing-topic";
  const staleDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1e3).toISOString();
  const freshDate = (/* @__PURE__ */ new Date()).toISOString();
  (0, import_node_fs.writeFileSync)(
    (0, import_node_path.join)(workspacePath, "topic-sessions.json"),
    JSON.stringify(
      {
        version: 1,
        updatedAt: freshDate,
        topics: [
          {
            id: staleTopicId,
            label: "Old Billing Issue",
            sessionKey: "agent:sub:old-billing",
            mainSessionKey,
            keywords: ["billing", "invoice", "old"],
            createdAt: staleDate,
            lastActive: staleDate,
            messageCount: 10,
            approxChars: 9e3,
            summary: "Legacy billing context summary."
          },
          {
            id: "fresh-topic",
            label: "Fresh Product Topic",
            sessionKey: "agent:sub:fresh",
            mainSessionKey,
            keywords: ["product", "roadmap", "fresh"],
            createdAt: freshDate,
            lastActive: freshDate,
            messageCount: 2,
            approxChars: 1200
          }
        ]
      },
      null,
      2
    )
  );
  const spawnedSessionKey = "agent:sub:new-topic";
  const invokeTool = async (tool, args) => {
    if (tool === "sessions_history") {
      return { messages: [] };
    }
    if (tool === "sessions_spawn") {
      return { sessionKey: spawnedSessionKey };
    }
    if (tool === "sessions_send") {
      if (String(args?.sessionKey || "") === spawnedSessionKey) {
        return { text: "Routed result from new topic session" };
      }
      return { text: "Existing topic response" };
    }
    throw new Error(`Unexpected tool: ${tool}`);
  };
  try {
    const result = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: "Need a deep dive into invoices and refunds",
      invokeTool
    });
    import_strict.default.notEqual(result.route.topicId, staleTopicId);
    import_strict.default.equal(
      result.envelope.next_actions.some((action) => action.includes('Archived inactive topic "Old Billing Issue"')),
      true
    );
    const doc = readTopicDoc(workspacePath);
    import_strict.default.equal(doc.topics.some((topic) => topic.id === staleTopicId), false);
    const archivePath = (0, import_node_path.join)(workspacePath, "memory", "topics", "archive", `${staleTopicId}.md`);
    import_strict.default.equal((0, import_node_fs.existsSync)(archivePath), true);
  } finally {
    cleanup();
  }
});
