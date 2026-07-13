// Timezone-aware helpers for scheduled notifications. Zero-dependency (Intl handles
// DST correctly), so "4:00 in America/Chicago" is right in both CST and CDT.

/** Current hour (0–23) in an IANA timezone. Falls back to UTC on a bad tz. */
export function localHourInTz(tz: string, at: Date = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(at));
  } catch {
    return at.getUTCHours();
  }
}

/** Current calendar day as YYYY-MM-DD in an IANA timezone (for once-per-day guards). */
export function localDayInTz(tz: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** True if the string is a timezone Intl accepts (used to validate settings input). */
export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
