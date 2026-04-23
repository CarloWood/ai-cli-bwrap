---
name: test-strategy
description: Build pragmatic verification plans for code changes. Use when designing or reviewing what tests should exist, which checks should run, and where coverage is too weak or too expensive.
compatibility: opencode
---

# Test Strategy

## Goal

Design the smallest high-confidence test plan that gives fast feedback and catches the most important regressions.

## Core Principles

1. Prefer many focused low-level tests over heavy end-to-end coverage by default.
2. Treat broad UI or end-to-end tests as a second line of defense, not the primary one.
3. Use the lightest test type that can reliably catch the risk.
4. Prefer tests that are isolated, order-independent, parallel-friendly, and deterministic.
5. If a high-level test exposed a bug, recommend reproducing that bug at a lower level when practical.

## Testing Shape

Use the test pyramid as the default bias:

1. Small tests: isolated logic, no network, no external systems, fast feedback
2. Medium tests: local integration between a few layers or components
3. Large tests: end-to-end, cross-system, or UI-driven verification

Do not over-prescribe UI or browser tests when unit, component, API, or service-level tests would cover the behavior more cheaply and reliably.

## Review Process

1. Identify the changed behavior, invariants, and failure modes.
2. Map each risk to the cheapest effective test layer.
3. Check for missing coverage at the boundaries most likely to regress.
4. Check whether the current suite is too top-heavy, flaky, slow, or redundant.
5. Recommend exact tests or commands that would provide confidence quickly.

## Heuristics

- Prefer one precise test over several overlapping broad tests.
- Test behavior, contracts, and invariants rather than implementation trivia.
- Call out flakiness risks such as time, network, shared state, ordering, and hidden dependencies.
- Favor tests that can run locally and in CI without special infrastructure when possible.
- If a test requires multiple systems, be explicit about why lower-level coverage is insufficient.

## Output

Return:

1. Recommended test layers for the task
2. Missing or weak coverage
3. The smallest useful verification commands
4. Residual risks that remain even after the proposed tests
