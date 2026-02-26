#!/usr/bin/env node
/**
 * Patches the bundled OpenClaw to fix model fallback when provider is in cooldown.
 * 
 * Bug: When fallbacksOverride is set (from agent config), resolveFallbackCandidates
 * may only produce 1 candidate (the primary). If that provider is in cooldown,
 * no fallback is attempted even though agents.defaults.model.fallbacks is configured.
 * 
 * Fix: After resolving fallbacksOverride candidates, if only 1 candidate exists,
 * also add defaults.model.fallbacks as additional candidates.
 * 
 * Reapply after every `yarn upgrade openclaw@*` or `yarn install`.
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const distDir = path.join(__dirname, '..', 'node_modules', 'openclaw', 'dist');

const OLD = `\tif (params.fallbacksOverride === void 0 && primary?.provider && primary.model) addCandidate({
\t\tprovider: primary.provider,
\t\tmodel: primary.model
\t}, false);
\treturn candidates;
}
async function runWithModelFallback(params) {`;

const NEW = `\tif (params.fallbacksOverride === void 0 && primary?.provider && primary.model) addCandidate({
\t\tprovider: primary.provider,
\t\tmodel: primary.model
\t}, false);
\tif (params.fallbacksOverride !== void 0 && candidates.length <= 1) {
\t\tconst defaultsModel = params.cfg?.agents?.defaults?.model;
\t\tconst defaultsFallbacks = (defaultsModel && typeof defaultsModel === "object") ? defaultsModel.fallbacks ?? [] : [];
\t\tfor (const raw of defaultsFallbacks) {
\t\t\tconst resolved = resolveModelRefFromString({ raw: String(raw ?? ""), defaultProvider, aliasIndex });
\t\t\tif (resolved) addCandidate(resolved.ref, false);
\t\t}
\t}
\treturn candidates;
}
async function runWithModelFallback(params) {`;

let patched = 0;
const files = fs.readdirSync(distDir, { recursive: true })
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(distDir, f));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.includes(OLD)) {
    fs.writeFileSync(file, content.replace(OLD, NEW));
    patched++;
    console.log(`  ✅ Patched: ${path.relative(distDir, file)}`);
  }
}

console.log(`\nModel fallback patch: ${patched} file(s) patched.`);
if (patched === 0) {
  // Check if already patched
  const alreadyPatched = files.some(f => {
    try { return fs.readFileSync(f, 'utf-8').includes('defaultsFallbacks'); } catch { return false; }
  });
  if (alreadyPatched) {
    console.log('✅ Already patched — no action needed.');
  } else {
    console.log('⚠️  No files matched — OpenClaw may have been updated. Review patch.');
  }
}
