#!/usr/bin/env node
// Poll the inReach MapShare Raw KML feed and print the latest position. The home
// agent runs this on a timer to drive the live map + geofenced triggers.
//
//   MAPSHARE_FEED_URL="https://share.garmin.com/Feed/Share/xxxxx" node scripts/poll-mapshare.mjs

const feed = process.env.MAPSHARE_FEED_URL;
if (!feed) {
  console.log('Set MAPSHARE_FEED_URL (explore.garmin.com → Social → MapShare → Feeds → Raw KML).');
  console.log('Leave the feed PASSWORD OFF so this can read it.');
  process.exit(0);
}

const res = await fetch(feed);
const kml = await res.text();
const pts = [...kml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)];
if (!pts.length) { console.log('No points in feed yet.'); process.exit(0); }
const last = pts[pts.length - 1];
const when = kml.match(/<when>([^<]+)<\/when>/g)?.pop()?.replace(/<\/?when>/g, '');
console.log(`📍 ${parseFloat(last[2])}, ${parseFloat(last[1])}  (${when ?? 'unknown time'})`);
