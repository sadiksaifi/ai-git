# Design: Full XState v5 State Machine Refactor

**Date**: 2026-02-21
**Status**: Approved for implementation
**Scope**: Complete CLI refactor — XState machines + codebase quality improvements

## Problem

The AI Git CLI has grown to 54 source files (~10,500 LOC) with:
- 38 scattered `process.exit()` calls across 6 files making testing nearly impossible
- Only the generation loop uses an explicit state machine; all other flows are linear/procedural
- 22 files (41%) have zero test coverage
- 5 known bugs between the state machine documentation and actual code
- Duplicated patterns (spinner, error handling, API adapter boilerplate) across 7+ files
- A 581-line monolithic `index.ts` orchestrator

## Solution

Refactor the entire CLI to use XState v5 state machines with composable, independently testable machines matching the existing state machine documentation (167 scenarios across 7 sub-flows).

## Architecture

### Machine Hierarchy
```
cliMachine (top-level orchestrator, E1-E18)
├── initMachine (--init, IN1-IN10)
│   └── setupWizardMachine (SW1-SW20)
├── setupWizardMachine (--setup / first-run, SW1-SW20)
├── stagingMachine (ST1-ST14)
├── generationMachine (GN1-GN29)
├── pushMachine (PU1-PU11)
└── upgradeMachine (UP1-UP11)
```

### Key Patterns
- **Every @clack/prompts call** → `fromPromise()` actor with `UserCancelledError` on cancel
- **Every async operation** → `fromPromise()` actor (git, AI, filesystem)
- **Auto-approve countdown** → `fromCallback()` actor (multiple event sources)
- **Spinners** → colocated inside `fromPromise()` actors, not in machine context
- **Single process.exit()** → only in `index.ts` after `waitFor(actor)` resolves
- **Testing** → `machine.provide({ actors: { ... } })` for dependency injection

### Bug Fixes
1. **Staging Path A** — explicit `shouldAutoStage` guard + `autoMore` state
2. **cerebras missing** — dynamic `PROVIDERS.map(p => p.id)`
3. **Generation fatal errors** — `onError` → `fatalError` → `done(aborted)`
4. **Init wizard self-exits** — machine output propagation, no internal exit
5. **Upgrade extraction check** — explicit `checkBinary` state

## Implementation Phases

1. **Foundation** — XState install, shared actors, error types, git.ts refactor
2. **Leaf Machines** — push, staging (Bug #1), upgrade (Bug #5)
3. **Complex Machines** — generation (Bug #3), setup wizard
4. **Orchestrators** — init (Bug #4), CLI (Bug #2), rewrite index.ts
5. **Quality** — eliminate duplication, fix types, add tests, clean up
6. **Optional** — XState inspector support

## Decisions

- **XState v5 over custom framework**: Industry standard, TypeScript-first, visual debugger, battle-tested
- **fromPromise() for all prompts**: @clack/prompts are one-shot async — no need for fromCallback()
- **Keep existing lib/ code as-is**: Machines wrap existing pure functions, minimal blast radius
- **Bottom-up migration**: Leaf machines first, compose upward, each phase independently testable
