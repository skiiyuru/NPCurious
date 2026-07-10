# Tips

Useful tips mentioned during the lab sessions or discovered in the wild

- wait for map to load
- agent movement: prev -> intermed -> dest; both prev and dest are locked. no other agent can move there.

## Lab2

- Implement belief revision for the crates: they could block some paths and thus having that info will ensure you pick a valid path
- Heatmap to track probability of parcels
- FOR project: come up with innovative BRF, get good marks

## Lab4

- Challenge 1:
  - No crates
  - Beware of directional tiles
  - 0 non-walkable; 1 spawn (green); 2 delivery(red); 3 walkable(white), IGNORE tile 4
- Challenge 2:
  - tile 5 is for the sliding crate challenge
  - 5! means crate is spawned on tile 5

- you can use `onTile` to plan routes
- `await` confirmation from server about your exact coord after a move - see `blind-move.js` as example

- BDI loop:
  - Given a set of beliefs B:
    1. Decide about possible intentions to adopt
    2. Select new intentions to adopt
    3. Revise the Intention set I
    4. Revise and/or select new plans P for I
    5. Execute plans

## Support Lab 21/4/2026

- `onTile` convert to string to be safe
- parcels data can be retrieved from the game info
  - socket.onConfig((data) => data.GAME)
  - max; spawn-time;
- you can set some configurations for your agent to give it an edge on certain maps
  - this gives it the ability to adapt
  - however, it should still be autonomous

## Lab 5

- install pddl package 1.7.7 (check video)
- domain file remains static - define it manually
- problem file is generated dynamically
  - example: `3belief.js` (see code)
- useful to solve crates problems, multi agent coordination, organizing intentions, parcel ordering and delivery to maximize score. Seems creativity is key here.
  - `oneWayCrates` `cratesMaze` maps (sokoban style)
- .env (planning as a service)

  ```js
  const HOST = process.env.PAAS_HOST || "https://solver.planning.domains:5001"
  const PATH = process.env.PAAS_PATH || "/package/dual-bfws-ffparser/solve"
  ```

- sending messages to agent:
  - `socket.emitSay('')` 1to1; does not require reply
  - `socket.emitAsk('')` 1to1; requires reply
  - `socket.onMsg('')` listen for msgs
- define a coordination criteria: master/slave, delayed response, etc.
- useful with the LLM agent interactions
  - LLM translates natural language to structured msg protocols
- get zed extention for .pddl files
- defining crates in domain file:
  - predicates: right(), left(), up(), down()
- for the problem file,
  - all tiles within sensor range
  - all agents

- Final report (max 10 pages)
- Exam day: slides summarizing report

## Lab 6 (LLMs part 1)

- deps:
  - openai
  - bears API from email
