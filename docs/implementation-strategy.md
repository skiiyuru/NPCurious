# Implementation Strategy

- This strategy was formulated by considering the Lecture on BDI loop implementation and associated lab example found in `/references/bdi-loop.js. A complete history of the exercise can be found [here](https://share.solve.it.com/d/6376211d6dad098af5fdfcf88f97e64a#phase-1-quick-alignment-bdi-loop-the-code_1.html):

## Architecture overview

Separate concerns into modules that mirror the BDI loop:

- **Beliefs** — stateful module exposing both an event emitter (push:
  "parcel-appeared", "parcel-taken", "agent-moved") and a query API
  (pull: `getFreeParcels()`, `isObstacleAt(x,y)`, etc.)
- **Options** — generator (B → O) and EV-based filter (O → S)
- **Intentions** — queue + revision strategies (Queue / Replace / Revise)
  as swappable plug-ins; intentions are first-class objects with metadata
  (createdAt, estimatedEV, progress, status)
- **Plans** — library of plan classes with `isApplicableTo` + cost
  estimates, plus a context-aware selector
- **Utils** — pure helpers: distance, A\* pathfinding, EV math

---

## Phase 0: Spine (working baseline)

Goal: replicate the template's behavior in clean modules.

- [ ] `BeliefBase` module with query API + event emitter
- [ ] Options generator (pickup only, no EV)
- [ ] Intention queue with Replace strategy
- [ ] `GoPickUp` and `BlindMove` plans
- [ ] **Fix bug from template**: in `IntentionRevision.loop`, when an
      intention is detected as invalid, the code does `continue` without
      first calling `intention_queue.shift()`. This leaves the invalid
      intention at the head of the queue, causing an infinite loop of
      "Skipping intention because no more valid". Fix: shift before
      continuing, or restructure the validity check.

---

## Phase 1: Make it actually score

Goal: agent picks up _and_ delivers, prefers high-value parcels.

- [ ] `GoDeliver` plan (template only ships `GoPickUp` + `BlindMove`,
      so the agent currently picks up parcels but never delivers them)
- [ ] Add delivery zones to the belief base
- [ ] Generate delivery options whenever the agent is carrying parcels
- [ ] Replace nearest-only filter with **Expected Value** filter:
      `EV = P(available) × Reward`, factoring in: - parcel reward - reward decay over time (parcel timer) - distance to pickup AND distance to delivery zone after pickup - carrying capacity

---

## Phase 2: Smarter movement

Goal: agent navigates around static obstacles.

- [ ] Map representation in beliefs (walkable tiles, known obstacles)
- [ ] A\* path planner to replace `BlindMove` (the template's mover
      emits direction commands without checking for obstacles, only
      reacting after a move fails)
- [ ] Check plan soundness against beliefs before each action;
      replan on belief changes that invalidate the current plan

---

## Phase 3: Belief sophistication

Goal: reason about an uncertain, partially-observable world.

The template uses a **memory-less** belief model: a parcel is deleted
from beliefs the moment it leaves sensing range. The course slides
introduce richer models — memory + uncertainty — that we should adopt.

- [ ] **Memory**: retain parcels seen but not currently sensed
- [ ] **Confidence per belief**: `P(parcel@x,y)` instead of binary
      true/false; decay with time/distance using `D(d) = e^(-λ·d)`
- [ ] Track **other agents' positions** (template has no `agents` map)
- [ ] **Bayesian update** on contradicting evidence — e.g. when another
      agent reports `¬Seen(parcel)`, update confidence using
      `P(H|E) = P(E|H)·P(H) / P(E)`
- [ ] Distinguish **Belief Revision** (correcting a wrong belief about
      a static world) from **Belief Updating** (reflecting a changed
      world); the template currently treats both identically

---

## Phase 4: Intention revision

Goal: agent reconsiders mid-execution without thrashing.

- [ ] Implement the **Revise** strategy (left as a TODO in the template).
      Unlike Queue (FIFO) and Replace (preempt with newest), Revise
      re-ranks the entire intention set by utility every time a new
      option arrives.
- [ ] **Hysteresis**: only switch to a new intention if its EV is
      significantly higher than the current one — prevents the
      "schizophrenic" behavior the slides warn about
- [ ] **Sunk-cost awareness**: if 90% through delivering parcel A, don't
      abandon for a marginally-better parcel B
- [ ] Intention metadata to support the above (createdAt, current EV,
      progress, status)

---

## Phase 5: Multi-agent coordination (project Part 2)

Goal: BDI agent + LLM-driven agent acting as a team. Each agent has its
**own** belief base; they coordinate via messages.

- [ ] Inter-agent communication module
- [ ] Beliefs about the other agent's beliefs / intentions
      (course slides: "I believe you believe...", "I believe you intend...")
- [ ] Trust modeling — e.g. "I trust the other's sensor X% of the time"
- [ ] Coordination logic to avoid both agents targeting the same parcel
      (factor `P(other agent grabs it first)` into EV)
- [ ] LLM adapter that translates natural-language user instructions
      into BDI predicates injectable into the intention queue

---

## Notes on template gaps to be aware of

A few specific issues in the provided template, beyond the items above:

- **`optionsGeneration` fires on every sensor tick**, including ticks
  that don't change the set of pickable parcels. Better: trigger on
  semantic belief-change events (parcel appeared/disappeared/taken).
- **`IntentionRevisionReplace`** dedups against only the last queue
  entry, and never cleans up stopped intentions left behind in the
  queue.
- **`IntentionDeliberation.achieve`** uses first-match plan selection
  (linear scan of `planLibrary`); fine when there's one plan per
  predicate, but doesn't support context-based plan choice.
