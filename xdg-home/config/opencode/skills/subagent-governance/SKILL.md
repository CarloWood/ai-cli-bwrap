---
name: subagent-governance
description: Configure and refine OpenCode agents, subagents, prompts, permissions, and skill routing. Use this whenever the user wants better agent orchestration, cleaner agent definitions, safer permissions, or asks about how to wire skills into agents.
compatibility: opencode
---

## Goal

Design subagent setups that are easy to extend, safe by default, and predictable to invoke.

## Workflow

1. Inspect the current OpenCode layout first.
2. Prefer file-based agents in `$XDG_CONFIG_HOME/opencode/agents/` or project-local `.opencode/agents/` when prompts are non-trivial.
3. Keep shared runtime settings in `opencode.json` or `opencode.jsonc`.
4. Use `permission` rules instead of legacy `tools` flags when creating or updating agents.
5. Give each agent a narrow description that states both what it does and when it should be invoked.
6. Use per-agent `permission.skill` rules when some agents should see only a subset of skills.
7. Keep prompts short, task-specific, and operational. Remove generic filler.

## Preferred Structure

Use this layout when the configuration grows beyond a couple of agents:

```text
$XDG_CONFIG_HOME/opencode/
  opencode.jsonc
  agents/
    code-reviewer.md
    debugger.md
    devops.md
  skills/
    <skill-name>/SKILL.md
```

## Heuristics

- Put models in the agent definition when the agent genuinely needs a different model.
- Keep read-only agents explicitly unable to edit.
- Restrict specialized skills to the agents that benefit from them.
- Prefer one purpose per subagent instead of broad "do everything" prompts.
- If multiple agents share the same long instructions, move the shared guidance into a skill and allow the relevant agents to load it.

## Output

When asked to improve a setup, return:

1. The layout changes.
2. The permission changes.
3. The model-routing changes.
4. Any follow-up skills or agents worth adding.
