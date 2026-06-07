import type { APIRoute } from 'astro';
import { getObjectives, getStops, getSkills } from '../../lib/data';
import { objectiveImageUrls, ytThumb } from '../../lib/packet';

export const prerender = false;

// 📦 Offline-packet manifest. Assembles the complete list of URLs the service
// worker should precache so the whole reference kit survives a dead zone: every
// confirmed objective dossier, all town dossiers, the skills library, plus every
// cacheable image (dossier photos via /img, field-guide photos via /extimg, and
// YouTube thumbnails). The /packet page hands this list to the SW. Confirmed
// objectives only — scouting alternatives ('proposed') are hidden from the public
// site, so they stay out of the packet too.
//   GET /api/packet-manifest

export const GET: APIRoute = async () => {
  const [objectives, stops, skills] = await Promise.all([
    getObjectives(), // confirmed only (includeProposed defaults false)
    getStops(),
    getSkills(),
  ]);

  const pages = [
    '/packet',
    '/skills',
    ...objectives.map((o) => `/objectives/${o.id}`),
    ...stops.map((s) => `/stops/${s.id}`),
  ];

  const images = [
    ...objectives.flatMap(objectiveImageUrls),
    ...skills.map((s) => ytThumb(s.video_url)).filter((u): u is string => !!u),
  ];

  // A content signature so the page can detect "update available" — newest
  // updated_at across the cached entities, falling back to the count.
  const stamp = (rows: any[]) =>
    rows.reduce((max, r) => {
      const t = r?.updated_at ?? r?.beta_updated_at ?? '';
      return t > max ? t : max;
    }, '');
  const version = [stamp(objectives), stamp(stops), stamp(skills)].join('|') ||
    `${objectives.length}-${stops.length}-${skills.length}`;

  const body = {
    version,
    pages: [...new Set(pages)],
    images: [...new Set(images)],
    counts: { objectives: objectives.length, stops: stops.length, skills: skills.length },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
