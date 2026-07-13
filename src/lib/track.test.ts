import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackPoints } from './track.ts';

// Garmin Raw KML shape: one <Placemark> per fix (TimeStamp + Point), plus a summary
// track-line Placemark with no <when> that must be ignored.
const KML = `<?xml version="1.0"?><kml><Document>
  <Placemark><TimeStamp><when>2026-07-16T14:00:00Z</when></TimeStamp>
    <Point><coordinates>-97.7431,30.2672,150.0</coordinates></Point></Placemark>
  <Placemark><TimeStamp><when>2026-07-16T14:10:00Z</when></TimeStamp>
    <Point><coordinates>-97.8000,30.3000</coordinates></Point></Placemark>
  <Placemark><name>Track</name>
    <LineString><coordinates>-97.7431,30.2672 -97.8000,30.3000</coordinates></LineString></Placemark>
</Document></kml>`;

test('parses per-placemark point + time, skips the line placemark', () => {
  const pts = parseTrackPoints(KML);
  assert.equal(pts.length, 2);
  assert.deepEqual(pts[0], { at: '2026-07-16T14:00:00.000Z', lat: 30.2672, lng: -97.7431, ele: 150.0 });
  assert.equal(pts[1].ele, undefined); // no elevation on the 2nd point
});

test('sorts chronologically and de-dupes repeated timestamps', () => {
  const dupe = `<kml>
    <Placemark><when>2026-07-16T14:10:00Z</when><Point><coordinates>-97.8,30.3</coordinates></Point></Placemark>
    <Placemark><when>2026-07-16T14:00:00Z</when><Point><coordinates>-97.7,30.2</coordinates></Point></Placemark>
    <Placemark><when>2026-07-16T14:10:00Z</when><Point><coordinates>-97.8,30.3</coordinates></Point></Placemark>
  </kml>`;
  const pts = parseTrackPoints(dupe);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].at, '2026-07-16T14:00:00.000Z'); // earliest first
  assert.equal(pts[1].at, '2026-07-16T14:10:00.000Z');
});

test('empty / pointless KML yields nothing', () => {
  assert.deepEqual(parseTrackPoints('<kml></kml>'), []);
});
