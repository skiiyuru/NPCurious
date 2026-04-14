- `beliefs.js` = knowledge
- `pathfinder.js` = navigation
- `planner.js` = action sequence generation
- `agent.js` = decision loop

The agent is built to work as a small BDI-style system:

- `Beliefs`: what the agent currently knows about the world
- `Desires/Intentions`: what it wants to do next
- `Plans`: the concrete actions needed to do it

I used this structure because the environment changes often. Parcels appear, disappear, get picked by others, and paths can become blocked. A BDI loop makes the agent easier to update and replan without rewriting the whole behavior.

# `beliefs.js`

This file is the world model.

It stores:

- map tiles
- spawn tiles
- delivery tiles
- visible parcels
- visible agents and crates
- player position
- blocked moves
- visited tiles

Reasoning

- It keeps perception separate from action, so the rest of the code can reason using a clean shared state.
- It normalizes map data before using it, which avoids bugs caused by inconsistent tile formats.
- It remembers blocked moves for a short time instead of forever, so the agent can recover from temporary obstacles.

# `pathfinder.js`

This file decides how to move from one tile to another and how to choose exploration targets.

Main responsibilities:

- find a path between two positions
- find the nearest delivery tile
- choose where to explore next
- prioritize parcel spawn tiles when no parcel is currently worth chasing

Reasoning

- Pathfinding is separated from high-level decision making, so navigation can be improved without changing the whole agent.
- Exploration is spawn-first because parcels are more likely to be found there, so this is more useful than random wandering.
- Paths can be computed with or without avoiding other agents, which helps the bot stay productive in crowded situations.

# `planner.js`

This file converts an intention into executable low-level actions such as:

- `move`
- `pickup`
- `putdown`

Reasoning

- A plan gives a full sequence of steps that can be executed, checked, and replaced if something fails.
- Using search for planning makes pickup, delivery, and exploration behave in a consistent way.
- The planner first prefers safer routes, then falls back to routes through temporary agent positions if needed.

# `agent.js`

This file is the main controller. It runs the BDI loop:

1. update beliefs from the server
2. deliberate the next intention
3. generate a plan
4. execute actions
5. replan when the world changes or an action fails

Main behavior order:

- if carrying parcels, deliver them
- else if visible parcels are worth taking, pick them up
- else patrol spawn tiles to search for new parcels

Reasoning

- Delivery has priority because carried parcels are already secured and should be converted into score quickly.
- Visible parcels are evaluated before exploration so the agent reacts to immediate opportunities.
- Exploration is used only when no good pickup is available.
- Server move acknowledgements are trusted more than local guesses, which makes movement more robust.
- Failed moves trigger replanning instead of repeating the same wrong action forever.

