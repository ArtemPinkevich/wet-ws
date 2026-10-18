---
name: iteration-orchestrator
description: Orchestrate a product iteration from user stories through context collection, decision gates, implementation readiness, implementation, verification, completion, and a nonblocking post-iteration process health check.
---

# Iteration Orchestrator

Use the minimum process necessary to safely implement the iteration.

## Workflow

1. Find the user stories selected for the iteration.
2. Collect only relevant current project context.
3. Create or resume `docs/engineering/iterations/iteration-NN/context-pack.md` as the main working document, using the [Context Pack reference](references/iteration-context-pack.md). Keep scope, acceptance criteria, hidden requirements, decisions, open questions and evidence there. Do not require separate requirements, architecture and UX files. A new iteration starts with this file only; preserve useful historical/visual/evidence artifacts by explicit purpose.
4. Run gates in order:

- Iteration Scope Gate
- Hidden Requirements Gate
- Architecture Impact Gate
- Protocol & Data Contract Gate
- UX Impact Gate
- Reliability & Concurrency Gate
- Implementation Ready Gate

5. Every gate must return one of:

- PASS
- SKIP
- BLOCK
- ESCALATE

6. Do not write code until Implementation Ready returns PASS.

7. Use Sol for routine analysis and implementation.

8. Escalate only narrow, materially difficult questions to Astra.

Escalate when a material decision remains unresolved after a bounded attempt: evidence or constraints conflict, a repeated approach produces no new evidence, or Sol cannot justify a consequential choice. Do not wait for exhaustion and do not impose an automatic attempt count. Missing user intent/approval is BLOCK for the user, not reasoning work for Astra. Examples include a substantial new system boundary, conflicting ownership/invariants, serious trade-offs, difficult contract interactions or conflicting canonical constraints. File count, routine refactoring and ordinary bugs are not reasons for Astra. Routine fixes and unfamiliar but straightforward lookups remain with Sol or a relevant skill.

9. When escalating:
   - provide only the minimum relevant context;
   - prefer Astra Low initially;
   - do not ask Astra to redesign unrelated parts of the system;
   - request the minimum sufficient solution;
   - keep the result concise.

10. After Implementation Ready passes:
    - when an actual transfer to Sol is needed, generate the minimum temporary handoff text from the pack according to the lifecycle below;
    - implement the selected stories;
    - run tests and relevant checks;
    - verify acceptance criteria and discovered edge cases;
    - check architecture/contract conformance when relevant;
    - update canonical project documentation only when it actually changed.

After Implementation, run Verification, then Architecture & Contract Conformance with the existing Independent Reviewer; resolve blocking findings and run a relevant recheck before deciding Iteration Done. Include only applicable architectural/contract checks; review is part of conformance, not a new mandatory code-review gate or a second reviewer. Product gates use the same PASS / SKIP / BLOCK / ESCALATE results. After Done, perform the nonblocking Process Health Check below; it evaluates the workflow, not product acceptance, and does not reopen or delay Done. NOT RUN describes missing execution, not a successful SKIP. For retrospective packs, use UNKNOWN / NOT RECORDED when a historical gate has no evidence; never infer pre-implementation readiness merely from later completion. Preserve explicit acceptance and known limitations.

During development, use format, lint:fix and suitable narrow checks as needed. Before completing **any change set**, including documentation/workflow-only changes, run the full canonical `npm run check` from `app` and obtain a successful result. This is part of existing Verification, not a new product gate; narrow checks and an earlier success on superseded checked files/configuration do not substitute for it. Record the command/result in existing verification evidence or the completion response; do not create a separate quality report. A failed check prevents completion, while a successful check alone proves neither functional acceptance nor Iteration Done. Tests remain a separate verification layer selected for the change; do not merge them into check by default. Durable principles live in [the app README](../../../app/README.md#качество-кода); concrete machine-enforced rules live in existing tooling configuration.

11. Do not create documents merely because a gate ran.

UX SKIP / NO_CHANGE creates no mockups. A small nonvisual behavior delta stays in the Context Pack. Every visual UI change, new screen or significant visual state requires a mockup delta containing only affected surfaces/states in docs/engineering/iterations/iteration-NN/mockups/. Mirror the relative paths of docs/engineering/ui/mockups/, the sole canonical set for current implemented UI; do not copy the full set. Keep proposed or accepted-but-unimplemented visuals out of canonical. Record each file status and any replaced or removed surface in the pack.

## Planning gate decisions

**Architecture Impact:** ask whether responsibility, ownership or dependency direction changes; whether the existing structure solves the task; and which current problem any new abstraction solves. Record NO_CHANGE / DELTA / REVIEW as impact, separately from gate status. SKIP means impact was assessed and no relevant change exists; PASS means material decisions are defined and testable; BLOCK means a requirement, owner decision or necessary information is missing; ESCALATE means one materially difficult question remains after bounded analysis. Do not require redesign, diagrams or a separate document for every iteration.

**Protocol & Data Contract:** when exchange or its meaning changes, identify affected protocol units/owners, single definitions and how to discover the full contract, agreement between sender/receiver, runtime input validation, and response/error semantics. Assess ordering, recovery, retries and compatibility only where material to this change. No contract change means SKIP with a short reason. Do not design future commands or inspect every possible protocol property on every change.

**Implementation Ready:** reconcile prior gates: material ownership, dependencies, contract shape/meaning, errors and verification must be resolved before coding. Refer to their decisions and criteria rather than repeating checklists. Internal functions and final file layout need not all be predetermined; missing author decisions remain BLOCK, not Astra work.

## Backlog routing and relevance

Use [Product Backlog](../../../docs/product/backlog.md) for potential user value not yet selected in roadmap; use [Technical Backlog](../../../docs/engineering/technical-backlog.md) for consciously deferred limitations, risks, optimizations and architectural concerns. Do not duplicate existing user stories or turn either register into a specification.

When a new topic is unnecessary for the current scope, classify it and record a compact canonical item in the appropriate register. Product items need ID, idea/value, origin and status. Technical items need ID, title, status, context, why deferred, current accepted assumption, consequence, review trigger and origin iteration. An explicitly accepted deferred concern is not an OPEN blocker of that iteration; retain only its ID/link and status in the Context Pack. Deferral does not imply implementation or readiness of unrelated gates; unresolved essential scope decisions remain blockers.

At planning/resumption, perform only a light relevance check: product items explicitly selected by the owner, and technical items whose review trigger has occurred or which directly intersect the new scope. Use concise titles/triggers or supplied IDs; do not fully reread or reanalyze all backlog items. If no trigger/relevance exists, leave the item deferred without spending reasoning on it. When triggered, return that specific item to ordinary planning / Architecture Impact and update its status; no new gate or mandatory pipeline stage. Keep detailed concern state only in its backlog, not copied into Context Pack or overview.

## Architecture documentation

Use docs/engineering/architecture/overview.md as the sole canonical current architecture. The Context Pack holds change-context: the affected responsibilities/owners, dependency directions and rationale, not a copy of canonical architecture. Planning gate decisions above define impact and readiness independently. NO_CHANGE leaves canonical unchanged and creates no architecture artifact. DELTA records the proposal and accepted change in the pack; REVIEW first performs a bounded analysis, then follows the same delta path. Keep proposal, acceptance, implementation and verification distinct; only accepted, implemented and verified behavior updates affected canonical sections. Do not create a full iteration architecture by default. Before removing redundant material preserve unique current knowledge in overview and unimplemented proposals in the pack; the preservation rule below still applies. Keep rationale/alternatives in the pack; use ADRs only when independently warranted.

## UI mockup completion

At Iteration Done, if iteration-NN/mockups/ exists, confirm that each accepted visual change was implemented, verified and accepted by the user. Apply only that accepted delta to docs/engineering/ui/mockups/, including explicitly agreed removal of replaced surfaces. Resolve or exclude outdated/unaccepted variants rather than promoting the whole directory blindly. Verify canonical mockups reflect the final implemented UI, update links, then delete the iteration mockups directory; completed iterations retain no copies. Git stores change history; this rule does not authorize an unsolicited commit. Retain set-specific generators only when reproducibility remains useful and update their output paths. SVG sources and PNG previews may coexist. Do not create an additional UI overview/index/history source of truth.

Before relying on Git to preserve unique content being replaced/deleted, verify that those exact contents are reachable in a commit; a .git directory or an untracked file is not history. If not preserved, keep the unique material and request a human decision on saving it or explicitly discarding it. Do not automatically commit, fabricate an archive, or claim cleanup complete. This check applies to loss of unique history, not removal of a verified duplicate whose useful content remains elsewhere. Until history is saved, already identified unaccepted variants may stay explicitly excluded from the active delta; do not silently delete them.
## Iteration handoff lifecycle

The Context Pack stores iteration state. Iteration Handoff is a temporary transport artifact containing only the minimum context needed by another model or session. Sources of truth are context-pack.md and the corresponding canonical project documentation; neither a handoff nor the receiving model response is an additional source of truth.

Generate a handoff only when a real context transfer is needed, including ESCALATE to Astra for one narrow question or Implementation Ready PASS to Sol for implementation. A new session alone does not require one. Default to temporary text sent to the receiving session, not a file. Do not automatically create iteration-NN/iteration-handoff.md or any equivalent instance. Instances are not stored in iteration folders, retained as permanent documentation, or committed to the repository.

Use the [handoff reference](references/iteration-handoff.md) only to structure that temporary text; select relevant sections rather than filling the entire template. The existence of the template does not require creating a file. Include the source Context Pack reference and the snapshot date; the receiver must use canonical state if it conflicts with the transport text.

After processing by Astra/Sol, return every accepted decision, clarification and state change to the Context Pack, or to the corresponding canonical document when it belongs to long-term project state. Preserve proposal/acceptance/implementation status and existing canonical update rules. Do not use a raw response as a parallel specification. Once the results are reconciled, the handoff has no documentation role; any temporary instance used for transport is discarded, without adding it to Git.
## Specialist selection

Run gates, not a sequence of specialist skills or agents. Handle ordinary analysis, implementation preparation and verification yourself. PASS/SKIP requires no specialist; BLOCK alone does not require one either (missing user input returns to the user). Invoke a skill only for an identified gap where its method is useful; record the narrow question and integrate the result into the Context Pack. Do not add NEEDS_SPECIALIST as a new gate status.

- [wet-ws-system-requirements](../wet-ws-system-requirements/SKILL.md): unclear behavior, hidden constraints or acceptance/transport evidence in Hidden Requirements, Protocol & Data Contract, Reliability & Concurrency or Verification.
- [wet-ws-c4-containers](../wet-ws-c4-containers/SKILL.md): a material boundary, responsibility, runtime, technology or deployment question in Architecture Impact DELTA/REVIEW; select Context or Container analysis only as needed, not both automatically.
- [wet-ws-ui-design](../wet-ws-ui-design/SKILL.md): UX states, recovery, focus/accessibility or visual design in UX Impact. A visual delta must be captured in mockups even when ordinary work can be handled without this skill.

A genuinely difficult narrow decision may use ESCALATE to Astra; specialist invocation neither requires another agent nor authorizes implementation. Existing PASS/SKIP/BLOCK/ESCALATE, Implementation Ready and temporary handoff rules remain unchanged.
## Autonomous agents

A skill supplies a method; an agent supplies a separate autonomous executor. Do not run a chain of role-based agents. Use skills yourself for ordinary gate work and choose an agent only for a distinct task; agent definitions live in .codex/agents/.

Apply the optional .local-instructions.md from the repository root when present, including its auxiliary-executor triggers. Load it before planning/resumption and when evaluating completion or a substantial workflow change. Its absence does not block the public workflow; auxiliary executors do not control product gates.
- [Independent Reviewer](../../../.codex/agents/independent-reviewer.toml): invoke after implementation is complete at verification/final gates before the Done decision. Earlier review is optional for material risk, architecture changes, ambiguity or divergence. Use the minimal context contract below. Resolve blocking findings in the normal flow and return accepted decisions/results to canonical state; no permanent review-report by default. Reviewer verdict does not replace gate status: the orchestrator decides Conformance/Done; missing review is never PASS.

These agents do not replace ESCALATE → temporary handoff → Astra for genuinely hard reasoning. Do not create a Research/Analysis agent or infrastructure for it as part of this model change.

### Reviewer context

Send a temporary message assembled from existing artifacts: goal, criteria and scope exclusions; links to accepted architecture/protocol deltas in the Context Pack; exact comparison base and reviewed state; diff plus changed/new file list; relevant canonical sections, protocol definitions and instructions; verification commands, actual results/evidence and untested conditions. Do not create review-handoff.md or treat the author's reasoning as proof.

Include new/untracked files in the actual comparison; reviewer may inspect direct callers/consumers as needed. If no Git base exists, state that limitation and identify an available original snapshot and its coverage. A file list is not a diff; if no reliable comparison exists, report that evidence limit. Rechecks receive new changes and the findings being closed, not a repeated full-project investigation. The reviewer definition owns review categories, blocking criteria and verdict format.

## Process Health Check

After Iteration Done, the main agent performs one bounded feedback pass using the iteration result, Context Pack, relevant evidence and significant user corrections. Sequence: Implementation → Verification → Architecture & Contract Conformance (including Independent Reviewer) → fixes/relevant recheck → Iteration Done → Process Health Check. This is not a blocking gate, a new product acceptance criterion or a specialist pipeline. The reviewer evaluates the iteration result; this check evaluates how the AI-assisted workflow produced it. Do not tune the process after every user remark.

Cover these four categories; distinguish recorded facts, likely causes and unknowns rather than inventing effectiveness or limit savings:

- **Excess complexity:** unnecessary artifacts/stages, skills without an identified need, excessive handoffs/context switches and new documentation duplication.
- **Model choice:** Astra used for work Sol could reasonably handle, Sol persisting too long on a materially difficult question, timing/usefulness of ESCALATE → temporary handoff → Astra, and whether the handoff was compact and sufficient. Judge from available evidence; success alone does not prove the model choice was optimal.
- **Gates and skills:** useful gates that ran, missed opportunities to detect problems earlier, timely specialist methods, repeated skill invocation without demonstrated value, and recurring task types not adequately covered by an existing gate/skill.
- **Human interventions (required):** significant corrections to requirements, architecture, mockups/artifacts, task understanding, direction, skill choice, escalation timing, unnecessary steps or rules the system could reasonably have applied itself. For each, ask whether it was specific content or a preventable workflow defect; cite the intervention and its consequence. If communication/evidence is unavailable, state that limitation rather than claiming no interventions occurred.

Classify each significant human correction:

- `CONTENT_ONLY`: a task-specific product choice or clarification that could not reasonably be inferred beforehand; no process change needed.
- `PROCESS_TUNE`: a candidate local improvement to a gate, skill, orchestrator, model selection, artifact preparation or context transfer.
- `SYSTEMIC_ISSUE`: a recurring, cross-stage or materially costly problem indicating a fundamental workflow defect; recommend separate analysis, potentially ESCALATE → Astra, rather than automatically repairing it.

Recommend a process change when at least one holds: recurrence, a general class of errors, predictably preventable intervention, a small safe correction, or noticeable extra work/model-limit consumption. The core test is whether a suitable gate, skill or instruction could reasonably have prevented what the human had to correct. Do not turn a new product preference into a universal workflow rule.

Return one health-check outcome (these are not new product gate statuses):

- `NO_CHANGE`: available evidence supports leaving the process unchanged; state material evidence limitations if any.
- `TUNE`: concrete recommendations, each with observation, intervention/inefficiency, likely cause, the specific gate/skill/instruction to change and the expected benefit in later iterations. Do not apply them automatically.
- `ESCALATE`: a systemic issue cannot safely be handled by local tuning; propose a separate bounded Astra analysis. This outcome alone neither launches Astra nor authorizes a workflow change.

Summarize the outcome briefly in the iteration completion response and, when recording follow-up state is useful, in the existing Context Pack completion section. Do not create process-health-report.md, iteration-retrospective.md, workflow-review.md or a retrospectives folder by default. Do not run or fabricate retrospective checks for already completed iterations merely because this rule was added.

Analyze, classify and recommend only. Changes to the orchestrator, gates, skills, agents or Sol/Astra rules require an explicit human decision; after that decision, update the appropriate canonical definition directly, not a parallel process document. An approved Astra analysis uses a temporary handoff for one difficult ambiguity; accepted decisions return to the Context Pack or canonical documentation, and routine work resumes through Sol/orchestrator.

Apply any relevant auxiliary-executor triggers from the optional local instructions; keep this feedback loop small and nonblocking.
