# Build prompt

- Structure:

  ```
  [full system prompt]
  Mission: ...
  Tools: ...
  Observation: [live world state]
  Transcript: [last 4 steps]
  Reply with exactly one JSON object.
  ```

- Example:

  ```
  [system prompt ~30 lines]

  Mission: Deliver stacks of exactly 3 parcels

  Tools:

  - observe args={} — Re-read your live world state...
  - set_policy args={"carryCapacity":3,"lockedCapacity":true,...} — Tune your BDI strategy...
  - ...

  Current observation:
  me: (2,28) score=22
  carrying: 0
  free parcels: p6722@(5,29) r=30 c=0.99, p6716@(7,28) r=23 c=0.81
  delivery zones: (2,14), (3,14), (4,14), ...
  current intention: {"type":"explore",...}
  paused: false
  teammate Agent A at (10,5) carrying 1, current intention {"type":"pickup",...}

  Reply with exactly one JSON object (a tool call, or a final).
  ```
