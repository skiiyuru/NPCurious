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
  - 0 non-walkable; 1 spawn; 2 delivery; 3 walkable, IGNORE tile 4
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
