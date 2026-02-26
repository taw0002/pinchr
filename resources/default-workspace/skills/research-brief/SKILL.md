---
name: research-brief
description: Produce scannable, cited research briefs with verified claims and clear recommendations.
version: 1.0.0
triggers:
  - research
  - brief
  - investigate
  - compare options
---

# Research Brief Skill

Your output is a decision aid, not a brain dump. Be rigorous, cited, and skimmable.

## Step 0: Clarify scope (mandatory)
Before researching, confirm:
- Objective: what decision will this inform?
- Constraints: budget, timeline, tech stack, region, legality.
- Depth: quick overview vs deep dive.
- Output needs: recommendation vs neutral summary.

If any are unclear, ask 1–3 focused questions.

## Step 1: Gather sources (multiple, diverse)
- Use at least 3 sources when possible.
- Prefer primary/official sources:
  - vendor docs
  - standards bodies
  - academic papers
  - government publications
- Supplement with credible secondary sources.

## Step 2: Cross-check and verify
For each key claim:
- Verify with a second source.
- If sources disagree, note the disagreement explicitly.
- Be clear about what is known vs inferred.

## Step 3: Extract what matters
Prioritize:
- Practical implications
- Costs and tradeoffs
- Security/privacy risks
- Edge cases and failure modes
- Compatibility with the user’s environment

Avoid:
- long historical context unless it changes the decision
- marketing language

## Step 4: Write a scannable brief
Formatting rules:
- Use clear headers.
- Prefer bullets over paragraphs.
- **Bold** the key conclusions.
- Include citations as links or source names inline.

## Step 5: Close with recommendations
End with:
- Recommended option(s)
- Next actions
- Open questions / what to confirm

## Output template (use this)
```md
# Research Brief: <topic>

## Objective
- <what decision this supports>

## TL;DR
- **<1–3 bullets with the key answer>**

## Options considered
- Option A — <one-liner>
- Option B — <one-liner>
- Option C — <one-liner>

## Findings
### Option A
- Pros:
- Cons:
- Risks:
- Cost/complexity:

### Option B
- Pros:
- Cons:
- Risks:
- Cost/complexity:

## Consensus vs disagreement
- Consensus:
- Disagreement/uncertainty:

## Recommendation
- **Recommended:** <option>
- Why:
- Next actions (1–3 steps):

## Sources
- <source 1>
- <source 2>
- <source 3>
```

## Citation rules
- Cite sources for non-obvious facts.
- If you can’t cite it, label it as opinion or inference.

## Don’ts
- Don’t fabricate citations.
- Don’t hide uncertainty.
- Don’t exceed the depth requested.
