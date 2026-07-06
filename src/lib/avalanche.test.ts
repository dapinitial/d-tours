import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInRing, findZone } from './avalanche.ts';

// A square around the Tetons-ish: lng -111..-110, lat 43..44 (GeoJSON [lng, lat]).
const square = [[-111, 43], [-110, 43], [-110, 44], [-111, 44], [-111, 43]];

test('pointInRing: inside', () => {
  assert.equal(pointInRing(43.5, -110.5, square), true);
});

test('pointInRing: outside', () => {
  assert.equal(pointInRing(42.5, -110.5, square), false);
  assert.equal(pointInRing(43.5, -109.5, square), false);
});

test('findZone: Polygon and MultiPolygon, first match wins', () => {
  const poly = { geometry: { type: 'Polygon' as const, coordinates: [square] }, properties: { name: 'P' } };
  const multi = {
    geometry: { type: 'MultiPolygon' as const, coordinates: [[[[-105, 39], [-104, 39], [-104, 40], [-105, 40], [-105, 39]]]] },
    properties: { name: 'M' },
  };
  assert.equal(findZone([poly, multi], 43.5, -110.5)?.properties.name, 'P');
  assert.equal(findZone([poly, multi], 39.5, -104.5)?.properties.name, 'M');
  assert.equal(findZone([poly, multi], 0, 0), null);
});

test('findZone: tolerates missing geometry', () => {
  assert.equal(findZone([{ geometry: null as any, properties: {} }], 43.5, -110.5), null);
});
