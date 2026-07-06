# Mountain Project interactive-topo schema (research notes)

Schema study of how the incumbent encodes user-drawn topos — the idea worth learning from (drawn overlays stored as separate objects linked to routes with pitch numbers). Source: onXmaps/mp-tools api-client docs + live `getPhotosTopos` responses via the vendored `scripts/mp-api.ts`. **Research only; see SKILL.md for the licensing lane.**

## Response shape (`getPhotosTopos --areaId/--routeId`)

- `users[]` — id, firstName, lastName, avatar
- `images[]` — photo objects with sizes + metadata
- `topos[]` — overlay objects; drawing data is a **JSON-encoded string** in `topoData`
- `topoRelations[]` — the join layer: `{ relation: { id, parentId, pitch, type, topoId, imageId } }` linking a topo to a route **with pitch number**

## topoData (decode with `jq '.topos[0].topoData | fromjson'`)

```json
{ "items": [ { "it": 0, "cp": [{"x":100,"y":200},…], "ic": "#FF0000", "lw": 2, "ia": 1.0 } ] }
```

Item types (`it`): `0` Line (route path w/ control points `cp`), `1` Bolt, `2` Rappel, `3` Belay, `5` Text label, `6` Piton. Style: `ic` color, `lw` line width, `ia` alpha. Coordinates are in image pixel space.

## Design takeaways for shotgundetour dossiers (if/when topo overlays happen)

1. **Overlays are first-class rows, not baked into images** — a photo can carry many topos; a topo can serve many routes.
2. **The relation table carries the semantics** (route id + pitch), so the same drawing links into route data without duplicating it.
3. **Drawing primitives are a tiny typed vocabulary** (line/anchor markers/text), stored as JSON — renderer-agnostic.
4. Panogram is adopting the same idea against OpenBeta IDs; if shotgundetour does topos, share that convention: `topo(id, image_ref, items_json)` + `topo_relation(topo_id, climb_ref, pitch)` where `climb_ref` is an OpenBeta uuid.

## Exploring live (dev-time only)

```bash
cd .claude/skills/climbing-data/scripts
npx tsx mp-api.ts getPhotosTopos --routeId 105717329 > /tmp/topos.json
jq '.topoRelations[].relation | {parentId, pitch, topoId, imageId}' /tmp/topos.json
jq '.topos[0].topoData | fromjson | .items[] | select(.it == 0)' /tmp/topos.json
```
