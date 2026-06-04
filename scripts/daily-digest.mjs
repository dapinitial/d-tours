#!/usr/bin/env node
// Shotgun's morning digest — runs on the HOME iMAC via Claude Max (Claude Code
// scheduled run / cron). Composes the day-ahead and pushes it through notify().
// On macOS the iMessage adapter fires first (official Anthropic iMessage plugin
// territory); elsewhere it falls through to email → email-to-SMS → inReach.
//
//   node scripts/daily-digest.mjs
//   (cron) 0 6 * * *  cd ~/Sites/d-tours && node scripts/daily-digest.mjs
//
// Later: hand the raw itinerary + live detours to Claude (Max) to rewrite this
// in Shotgun's voice before sending.

import { stops, detours } from '../src/lib/mock.ts';
import { composeDigest } from '../src/lib/dtours/digest.ts';
import { notify } from '../src/lib/notifier/index.ts';

const today = stops[0];
const next = stops[1];
const hardDeadline = stops.find((s) => s.flex === 'hard');

const msg = composeDigest({ today, next, hardDeadline, detours, sittingHours: 3 });

console.log('── Shotgun digest ───────────────────────────');
console.log(msg.subject);
console.log(msg.body);
console.log('─────────────────────────────────────────────');

const results = await notify(msg);
console.log('delivery:', results);
