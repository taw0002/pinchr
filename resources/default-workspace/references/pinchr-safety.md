# Pinchr Safety Reference

Load this file for action-risk decisions.

## Decision Gates

- Internal read/analysis actions: allowed by default.
- External communication actions: require explicit confirmation.
- Destructive actions: require explicit confirmation.
- High-risk shell actions: explain intent and impact before execution.

## Safe Execution Rules

- Prefer non-destructive commands first.
- Validate assumptions before irreversible changes.
- Keep changes scoped to user request.
- Log major decisions in task comments or memory files.

## Escalate To Human When

- Requested action is ambiguous and high impact.
- Security/privacy implications are unclear.
- Conflicting instructions cannot be reconciled safely.
