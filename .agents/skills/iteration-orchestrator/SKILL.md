---
name: iteration-orchestrator
description: Orchestrate a product iteration from user stories through context collection, decision gates, implementation readiness, implementation, verification, completion, and a nonblocking post-iteration process health check.
---

# Iteration Orchestrator

Use the minimum process necessary to safely implement the iteration.

## Workflow

Find selected user stories and collect relevant context. Create or resume `docs/engineering/iterations/iteration-NN/context-pack.md` using the [Context Pack reference](references/iteration-context-pack.md). It holds scope, criteria, decisions, questions and evidence. A new iteration starts with this file only; no separate requirements, architecture, UX or routing document by default.

### Early routing

At start/resumption quickly assess:

- Does user interaction or visual UI change, including errors, recovery and nonvisual interaction?
- Are product requirements clear, or is focused clarification needed?
- Do architecture, module responsibilities or dependencies change?
- Does protocol shape or meaning change?
- Are existing decisions sufficient for implementation?

Select work from these answers, not another checklist. Record material impacts and dependencies briefly in the pack. Backend changes are not automatically UI changes; protocol changes may affect visible behavior. Revisit routing when new evidence changes impact.

Keep the existing gates: Iteration Scope, Hidden Requirements, Architecture Impact, Protocol & Data Contract, UX Impact, Reliability & Concurrency, Implementation Ready. They return PASS / SKIP / BLOCK / ESCALATE and are conditional checks, not an execution order. Briefly assess irrelevant impact and mark SKIP without running that analysis. NOT RUN means missing execution, not SKIP. Retrospective UNKNOWN / NOT RECORDED preserves absent evidence.

### Work according to impact

**No UI/UX change:** do not start UI design or invoke OpenDesign. UX Impact is SKIP with a short reason in existing gate state; no special no-UI report or artifacts. Resolve only applicable technical/requirements questions. Sufficient existing decisions can lead directly to Implementation Ready without repeated analysis.

**UI/UX change:** use selected user stories, canonical requirements, existing backend/protocol and implemented capabilities to start interactive design in OpenDesign as soon as scenarios and constraints are clear enough. Do not wait for all architecture/protocol work. The UI track develops interactive scenarios/proposals; the technical track checks only affected backend capabilities, ownership, protocol and feasibility. Exchange material constraints and scenario discoveries. An unresolved dependency blocks the affected decision, not unrelated exploration.

Tracks may run in parallel or interleave in one agent. Small changes may use one sequential pass. Parallelism requires neither agents, duplicated packs nor permanent handoffs. Isolated prototype code is allowed before readiness; production `app` code is not. Simulated behavior does not prove real transport/persistence.

### Design tools

OpenDesign is the sole primary tool for visual design and interactive owner review: open the agreed project, or create the initial one if absent, then evolve it rather than recreate it. Check affected scenarios and states by interaction at relevant sizes; label simulated backend behavior and missing capabilities. Alternatives serve material uncertainty, not a required variant count; a full redesign explores alternative interactive concepts where the new UX is unresolved. Old frontend components and concepts, including Concept A, are references, not constraints; preserve product requirements, backend/protocol semantics and architectural decisions. If OpenDesign is unavailable, report the blocker; an equivalent interactive method requires a separate owner-approved exception, never silent substitution or screenshots alone.

Impeccable is outside the WET-WS workflow; leave its global installation intact for other projects. Do not introduce a replacement UI skill, tool-specific gate or additional design specification. Prototype revisions and agreement follow the existing convergence and lifecycle rules below; design tooling does not authorize dependencies, hooks or production changes.

### Implementation Ready: convergence before production code

PASS requires both:

- **Product agreement:** for significant UI/UX changes the owner reviewed an identified interactive prototype revision and agreed scenarios, material behavior and composition. Significant means a new flow/screen, changed interaction semantics or substantial composition/redesign. A narrowly specified small visual correction may rely on the owner's explicit request plus a checked interactive result; do not add a full concept approval ceremony.
- **Technical readiness:** applicable requirements, architecture, protocol and reliability decisions are resolved; ownership, errors, constraints and verification are sufficiently clear. No-change aspects need no redesign.

Record the prototype/project reference, revision or preserved export, agreement scope and source/date in the existing pack. UI approval does not close technical questions; feasibility does not imply owner approval. No-UI work needs only applicable technical readiness. Return contradictions to the affected track and recheck changed agreement before PASS. Missing owner decisions are BLOCK, not Astra reasoning work.

Internal function names and final file layout need not all be predetermined. Production changes begin only after PASS. Handoff is temporary text only for actual transfer; implement selected scope, verify criteria/edge cases and update canonical only for accepted, implemented and verified changes.

### Models and completion

Sol handles routing, context/code inspection, routine analysis, constraints, ordinary OpenDesign prototype work, implementation and verification. Use Astra for a narrowly scoped, materially difficult UX/alternative-concept, hidden-requirement, architecture or contradiction question after a bounded attempt. Conflicting evidence, an unjustifiable consequential choice or a repeated approach with no new evidence can warrant escalation; file count and routine unfamiliarity do not. Do not require Astra at each UI gate or wait for exhaustion. Give minimum context, prefer Astra Low initially, request a sufficient concise decision, return results to the pack and resume routine execution with Sol.

After implementation run Verification, then applicable Architecture & Contract Conformance with the existing Independent Reviewer. Resolve blocking findings and perform a relevant recheck before Done. Review is part of conformance, not a new gate. Missing execution is never PASS. After Done perform the nonblocking Process Health Check below; it neither reopens nor delays acceptance. Preserve explicit acceptance and known limitations.

During development use suitable narrow checks/fixing commands. Before completing **any change set**, including documentation/workflow-only work, obtain successful full `npm run check` from `app`. This belongs to existing Verification; narrow checks or success on superseded files/configuration do not substitute. Record the actual command/result in existing evidence or the completion response, not another report. Failure prevents completion; success alone proves neither functional acceptance nor Done. Tests remain a separate layer selected for the change. Durable principles live in [the app README](../../../app/README.md#качество-кода).

Do not create artifacts merely because a gate ran. UI evidence follows the lifecycle below. On resumption read old gate tables as recorded decisions, not a mandatory linear order; preserve valid product/technical decisions and reconsider affected readiness. A process change neither accepts an old prototype nor authorizes redesign implementation.

## Planning gate decisions

**Architecture Impact:** ask whether responsibility, ownership or dependency direction changes; whether the existing structure solves the task; and which current problem any new abstraction solves. Record NO_CHANGE / DELTA / REVIEW as impact, separately from gate status. SKIP means impact was assessed and no relevant change exists; PASS means material decisions are defined and testable; BLOCK means a requirement, owner decision or necessary information is missing; ESCALATE means one materially difficult question remains after bounded analysis. Do not require redesign, diagrams or a separate document for every iteration.

**Protocol & Data Contract:** when exchange or its meaning changes, identify affected protocol units/owners, single definitions and how to discover the full contract, agreement between sender/receiver, runtime input validation, and response/error semantics. Assess ordering, recovery, retries and compatibility only where material to this change. No contract change means SKIP with a short reason. Do not design future commands or inspect every possible protocol property on every change.

**UX Impact:** SKIP only when neither interaction nor visual UI changes. Otherwise PASS requires affected scenarios and interactive evidence reviewed under the agreement conditions above; unresolved significant owner choices are BLOCK. Early exploration may continue while another track is incomplete.

**Implementation Ready:** apply convergence above, reconciling applicable gate results and evidence rather than repeating analysis. Production code requires PASS; a prototype alone is insufficient.

## Backlog routing and relevance

Use [Product Backlog](../../../docs/product/backlog.md) for potential user value not yet selected in roadmap; use [Technical Backlog](../../../docs/engineering/technical-backlog.md) for consciously deferred limitations, risks, optimizations and architectural concerns. Do not duplicate existing user stories or turn either register into a specification.

When a new topic is unnecessary for the current scope, classify it and record a compact canonical item in the appropriate register. Product items need ID, idea/value, origin and status. Technical items need ID, title, status, context, why deferred, current accepted assumption, consequence, review trigger and origin iteration. An explicitly accepted deferred concern is not an OPEN blocker of that iteration; retain only its ID/link and status in the Context Pack. Deferral does not imply implementation or readiness of unrelated gates; unresolved essential scope decisions remain blockers.

At planning/resumption, perform only a light relevance check: product items explicitly selected by the owner, and technical items whose review trigger has occurred or which directly intersect the new scope. Use concise titles/triggers or supplied IDs; do not fully reread or reanalyze all backlog items. If no trigger/relevance exists, leave the item deferred without spending reasoning on it. When triggered, return that specific item to ordinary planning / Architecture Impact and update its status; no new gate or mandatory pipeline stage. Keep detailed concern state only in its backlog, not copied into Context Pack or overview.

## Architecture documentation

Use docs/engineering/architecture/overview.md as the sole canonical current architecture. The Context Pack holds change-context: the affected responsibilities/owners, dependency directions and rationale, not a copy of canonical architecture. Planning gate decisions above define impact and readiness independently. NO_CHANGE leaves canonical unchanged and creates no architecture artifact. DELTA records the proposal and accepted change in the pack; REVIEW first performs a bounded analysis, then follows the same delta path. Keep proposal, acceptance, implementation and verification distinct; only accepted, implemented and verified behavior updates affected canonical sections. Do not create a full iteration architecture by default. Before removing redundant material preserve unique current knowledge in overview and unimplemented proposals in the pack; the preservation rule below still applies. Keep rationale/alternatives in the pack; use ADRs only when independently warranted.

## UI mockup completion

The persistent OpenDesign project is the evolving design workspace. Reuse its accepted prototype in later UI iterations, distinguishing proposals by revision/variant. Keep an inspectable reference or runnable export of the reviewed revision in the pack; do not create a fresh project or several variants for every small edit. Unimplemented proposals remain outside canonical implemented UI.

`docs/engineering/ui/mockups/` remains evidence of the current implemented UI. Existing PNG/SVGs are evidence/history, not a compulsory prototype format or baseline for a full redesign. When local proposal/export files are needed, use affected surfaces only in `iteration-NN/mockups/`, grouped by corresponding surface; exact screenshot filenames and mirrored static files are not required. SKIP/NO_CHANGE creates none. A stable reviewed project revision can avoid duplicate local artifacts; a mutable unversioned link alone cannot prove approval.

At Done compare implementation against the agreed interactive revision and relevant states, then update affected canonical evidence after implementation, verification and owner acceptance. Reconcile the reusable prototype with the accepted implemented result without promoting unrelated proposals. Approval, implementation and verification remain distinct; no additional UI overview, history index or approval document is required.

Temporary iteration UI proposals, local prototype copies and review exports in `iteration-NN/mockups/` stay local and must be excluded from commits and merge requests from the moment they are created. Keep them ignored; before preparing an MR inspect its actual changed/staged file list, including already tracked files (gitignore does not untrack them). Do not include these temporary files in an MR even while owner acceptance is pending. Their local availability is for implementation and independent review, not publication.

After the owner accepts the implemented iteration, delete its temporary UI files and exports as completion cleanup. The owner explicitly authorized this lifecycle on 2026-10-25; no archive or additional per-iteration approval is required for these temporary files. Record agreement, revision identity and verification conclusions in the Context Pack before cleanup, and replace temporary-file links with retained project/revision references. Do not move these files into a private archive instead of deleting them. Keep the persistent OpenDesign project and canonical implemented UI evidence in `docs/engineering/ui/mockups/`; this rule does not authorize deleting those sources or sweeping historical iterations. For other unique non-temporary history, verify a retained source or ask the owner before deletion; do not automatically commit or fabricate an archive.

## Iteration handoff lifecycle

The Context Pack stores iteration state. Iteration Handoff is a temporary transport artifact containing only the minimum context needed by another model or session. Sources of truth are context-pack.md and the corresponding canonical project documentation; neither a handoff nor the receiving model response is an additional source of truth.

Generate a handoff only when a real context transfer is needed, including a focused design/technical question during planning or Implementation Ready PASS to Sol for production implementation. Planning transfers do not require Ready PASS and do not authorize production code. A new session alone does not require one. Default to temporary text sent to the receiving session, not a file. Do not automatically create iteration-NN/iteration-handoff.md or any equivalent instance. Instances are not stored in iteration folders, retained as permanent documentation, or committed to the repository.

Use the [handoff reference](references/iteration-handoff.md) only to structure that temporary text; select relevant sections rather than filling the entire template. The existence of the template does not require creating a file. Include the source Context Pack reference and the snapshot date; the receiver must use canonical state if it conflicts with the transport text.

After processing by Astra/Sol, return every accepted decision, clarification and state change to the Context Pack, or to the corresponding canonical document when it belongs to long-term project state. Preserve proposal/acceptance/implementation status and existing canonical update rules. Do not use a raw response as a parallel specification. Once the results are reconciled, the handoff has no documentation role; any temporary instance used for transport is discarded, without adding it to Git.
## Specialist selection

Run gates, not a sequence of specialist skills or agents. Handle ordinary analysis, implementation preparation and verification yourself. PASS/SKIP requires no specialist; BLOCK alone does not require one either (missing user input returns to the user). Technical skills serve identified gaps; UI/UX changes use OpenDesign directly through early routing. Record material questions/results in the pack, not a role pipeline. Do not add NEEDS_SPECIALIST as a new gate status.

- [wet-ws-system-requirements](../wet-ws-system-requirements/SKILL.md): unclear behavior, hidden constraints or acceptance/transport evidence in Hidden Requirements, Protocol & Data Contract, Reliability & Concurrency or Verification.
- [wet-ws-c4-containers](../wet-ws-c4-containers/SKILL.md): a material boundary, responsibility, runtime, technology or deployment question in Architecture Impact DELTA/REVIEW; select Context or Container analysis only as needed, not both automatically.

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
