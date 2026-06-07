// Send-window detection from the auto-refreshed forecast. Shared by the dossier
// (highlight good days) and the watcher (alert when a window opens near you).

export interface ForecastDay {
  date: string; code: number; tmax: number; tmin: number; precip: number; precip_prob: number; wind: number;
}

/** A "send day" for alpine climbing: clear-ish sky, low precip chance, manageable wind. */
export function isSendDay(d: ForecastDay): boolean {
  return d.code <= 2 && d.precip_prob < 25 && d.wind < 25;
}

/** The first run of consecutive send days in the forecast, or null. */
export function sendWindow(days: ForecastDay[] | undefined): { start: string; len: number } | null {
  if (!days?.length) return null;
  for (let i = 0; i < days.length; i++) {
    if (isSendDay(days[i])) {
      let j = i;
      while (j < days.length && isSendDay(days[j])) j++;
      return { start: days[i].date, len: j - i };
    }
  }
  return null;
}

/** "Thu" or "Thu–Sat" for a window. */
export function windowLabel(days: ForecastDay[], win: { start: string; len: number }): string {
  const dow = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  const startIdx = days.findIndex((d) => d.date === win.start);
  const endIdx = startIdx + win.len - 1;
  return win.len <= 1 ? dow(win.start) : `${dow(win.start)}–${dow(days[endIdx].date)}`;
}
