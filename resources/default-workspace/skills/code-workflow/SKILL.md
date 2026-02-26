---
name: code-workflow
description: Follow a safe, repeatable development workflow with branches, tests, and clean commits.
version: 1.0.0
triggers:
  - implement
  - code change
  - create a branch
  - commit
---

# Code Workflow Skill

You are a careful software engineer. Optimize for correctness, reviewability, and minimal blast radius.

## Branching rules (mandatory)
- **Never commit directly to `main` or `dev`.**
- Always create a feature branch:
  - `feat/<short-kebab>` for new features
  - `fix/<short-kebab>` for bug fixes
  - `chore/<short-kebab>` for refactors, tooling, docs

Example:
```bash
git checkout -b feat/add-stripe-webhook-retry
```

## Read before edit
Before changing anything:
1. Locate the relevant code paths.
2. Read the surrounding files/modules to learn conventions.
3. Search for existing helpers/utilities to reuse.

Rules of thumb:
- Prefer existing patterns over introducing new ones.
- Don’t rename/restructure unless the task requires it.

## Make changes in small, reviewable steps
- Aim for commits that are easy to understand and revert.
- Keep diffs scoped to the task.
- Avoid “drive-by” formatting changes.

## Testing and verification (required)
After changes:
- Run the project’s test suite or the narrowest relevant subset.
- For TypeScript repos, run:
  ```bash
  tsc --noEmit
  ```
- If linting exists, run it.

If tests are slow, document what you ran and why.

## Conventional commits (required)
Use conventional commit messages:
- `feat: ...`
- `fix: ...`
- `chore: ...`
- `docs: ...`
- `refactor: ...`
- `test: ...`

Examples:
- `feat: add invoice PDF download endpoint`
- `fix: prevent null orgId crash in report export`

## Commit discipline
Before committing:
- `git status` is clean except intended files.
- Skim the diff:
  ```bash
  git diff
  git diff --staged
  ```
- Ensure secrets are not present in code or logs.

## Push discipline
When pushing:
- Prefer pushing your branch.
- Use `--no-verify` only when instructed by project norms or to bypass local hooks that are known-noisy.

Example:
```bash
git push --set-upstream origin feat/add-stripe-webhook-retry --no-verify
```

## Using coding agents (for complex work)
When work is multi-file, algorithmic, or risky:
- Use coding agents like **Codex CLI** or **Claude Code** to draft changes.
- Provide them:
  - the spec/requirements
  - relevant file paths
  - constraints (no breaking changes, keep API stable, etc.)

Critical rule:
- **Review agent output before committing.** Treat it like a junior engineer’s PR.

Agent review checklist:
- Does it match the spec and acceptance criteria?
- Are edge cases handled?
- Any unnecessary refactors?
- Any security/privacy regressions?
- Are tests updated/added?

## Merge readiness
Before opening a PR or merging:
- Tests pass.
- No TODOs that matter.
- Clear description of changes and verification steps.

## Don’ts
- Don’t “just try things” on `main`/`dev`.
- Don’t commit broken builds.
- Don’t accept agent-generated code without reading it.
