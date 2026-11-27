/**
 * RFC 5545 iCalendar (.ics) generator for individual Pokémon GO events.
 * Uses floating local timestamps (no Z suffix) because Pokémon GO events follow each trainer's local clock
 * (e.g. 14:00–17:00 stays 14:00–17:00 in Apple Calendar, Google Calendar and Outlook).
 */
import { bonusFr, eventTextFr, eventTitle, type Lang, type RichGameEvent, type ToolsData } from '@mydexpogo/shared';
import type { DatasetIndex } from './dataset.js';
import { formatLocationBadge } from './live.js';
import { fileSlug } from './pdf.js';
import { downloadBlob } from './shareImage.js';

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatLocalDateTime(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function formatUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Escapes special characters for RFC 5545 TEXT values (backslash, semicolon, comma, newline). */
function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Folds lines longer than 75 chars with CRLF + single space per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    chunks.push(` ${line.slice(i, i + 74)}`);
  }
  return chunks.join('\r\n');
}

/** Builds a complete RFC 5545 `.ics` string for a single event, or `null` when the event has no valid start date. */
export function buildEventIcs(
  event: RichGameEvent,
  idx: DatasetIndex | undefined,
  lang: Lang,
  tools?: ToolsData,
  now = new Date(),
): { ics: string; filename: string } | null {
  if (!event.start) return null;
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;

  const rawEnd = event.end ? new Date(event.end) : null;
  const hasEnd = !!rawEnd && !Number.isNaN(rawEnd.getTime());
  const allDayOngoing = !hasEnd && event.eventType === 'local-event';

  const title = eventTitle(event.name, idx?.speciesByDex, lang);
  const descParts: string[] = [];
  if (event.summary) {
    descParts.push(eventTextFr(event.summary, idx?.speciesByDex, lang, tools?.moveNames));
  }
  const freeBonuses = event.bonuses.filter((b) => !b.paid);
  if (freeBonuses.length > 0) {
    const header = lang === 'fr' ? 'Bonus :' : 'Bonuses:';
    descParts.push(
      `${header}\n${freeBonuses
        .slice(0, 8)
        .map((b) => `• ${bonusFr(b.text, idx?.speciesByDex, lang)}`)
        .join('\n')}`,
    );
  }
  if (event.link) descParts.push(event.link);
  descParts.push('MyDexPoGo');

  const uidSafe = event.eventID.replace(/[^a-zA-Z0-9._-]/g, '-') || fileSlug(title);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyDexPoGo//Pokemon GO Events//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidSafe}@mydexpogo`,
    `DTSTAMP:${formatUtcStamp(now)}`,
  ];

  if (allDayOngoing) {
    const nextDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${formatLocalDate(start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatLocalDate(nextDay)}`);
  } else {
    const end = hasEnd && rawEnd!.getTime() > start.getTime() ? rawEnd! : new Date(start.getTime() + 3600_000);
    lines.push(`DTSTART:${formatLocalDateTime(start)}`);
    lines.push(`DTEND:${formatLocalDateTime(end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(title)}`);
  const loc = formatLocationBadge(event.location, lang) ?? event.location;
  if (loc) lines.push(`LOCATION:${escapeIcsText(loc)}`);
  if (descParts.length > 0) lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);
  if (event.link && /^https?:\/\//i.test(event.link)) lines.push(`URL:${event.link}`);

  if (!allDayOngoing) {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(title)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  const ics = `${lines.map(foldLine).join('\r\n')}\r\n`;
  return { ics, filename: `${fileSlug(title)}.ics` };
}

/** Downloads an RFC 5545 `.ics` file for one event so it opens straight in Apple/Google/Outlook Calendar. */
export function exportEventIcs(
  event: RichGameEvent,
  idx: DatasetIndex | undefined,
  lang: Lang,
  tools?: ToolsData,
): boolean {
  const built = buildEventIcs(event, idx, lang, tools);
  if (!built) return false;
  const blob = new Blob([built.ics], { type: 'text/calendar;charset=utf-8' });
  downloadBlob(blob, built.filename);
  return true;
}
