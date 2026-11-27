/**
 * Automatic multi-template Event Infographics (Max Battle, Community Day, Spotlight Hour, Raid Day, Long Event).
 * Built directly from Leek Duck + ScrapedDuck live data, localized in French, linked to Pokédex & Raid Counters,
 * and integrated with "My hunts" (missing collection entries highlighted in green ★).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  bonusFr,
  eventLabelFr,
  eventTextFr,
  eventTitle,
  type EventBonusItem,
  type EventDetailMon,
  type EventTemplateKind,
  type HuntSource,
  type RichGameEvent,
  type ToolPokemon,
} from '@mydexpogo/shared';
import { api } from '../lib/api.js';
import { useDataset } from '../lib/dataset.js';
import {
  exportEventInfographicPdf,
  exportWeeklyInfographicPdf,
  moveNameLocalized,
  renderEventInfographicImage,
  renderWeeklyInfographicImage,
  resolveHeroMon,
} from '../lib/eventInfographicExport.js';
import { useLang, useT } from '../lib/i18n.js';
import { countdownOf, dexFromImage, eventStatus, liveName, splitLiveLabel, useEvents, type GameEvent } from '../lib/live.js';
import { canCopyPicture, canSharePictures, copyPicture, downloadBlob, sharePictures } from '../lib/shareImage.js';
import { useTools } from '../lib/tools.js';
import { CountersSheet, useFromImage, useMissingHunts } from './GameTools.js';
import { Sparkle } from './Sprite.js';
import { useToast } from './toast.js';
import { TypeBadge } from './TypeBadge.js';
import { Badge, Button, Chip, Empty, Sheet, Spinner, buttonClass } from './ui.js';

export function useRichEvents() {
  return useQuery({
    queryKey: ['live', 'rich-events'],
    queryFn: () => api<{ events: RichGameEvent[] }>('/game/events').then((r) => r.events),
    staleTime: 15 * 60_000,
    retry: 1,
  });
}

interface TemplateTheme {
  heroBg: string;
  accentBg: string;
  accentText: string;
  pillClass: string;
  borderClass: string;
  icon: string;
}

const TEMPLATE_THEMES: Record<EventTemplateKind, TemplateTheme> = {
  max: {
    heroBg: 'linear-gradient(145deg, #2e0842 0%, #701a75 55%, #3b0764 100%)',
    accentBg: 'bg-fuchsia-500/20',
    accentText: 'text-fuchsia-200',
    pillClass: 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-300/40',
    borderClass: 'border-fuchsia-500/35',
    icon: '⚡',
  },
  community_day: {
    heroBg: 'linear-gradient(145deg, #064e3b 0%, #0f766e 60%, #115e59 100%)',
    accentBg: 'bg-emerald-400/20',
    accentText: 'text-emerald-100',
    pillClass: 'bg-emerald-400/25 text-emerald-50 ring-1 ring-emerald-300/40',
    borderClass: 'border-emerald-500/35',
    icon: '🌿',
  },
  spotlight: {
    heroBg: 'linear-gradient(145deg, #78350f 0%, #b45309 65%, #92400e 100%)',
    accentBg: 'bg-amber-300/20',
    accentText: 'text-amber-100',
    pillClass: 'bg-amber-300/25 text-amber-50 ring-1 ring-amber-200/40',
    borderClass: 'border-amber-500/40',
    icon: '✨',
  },
  raid_day: {
    heroBg: 'linear-gradient(145deg, #7f1d1d 0%, #991b1b 55%, #450a0a 100%)',
    accentBg: 'bg-rose-400/20',
    accentText: 'text-rose-100',
    pillClass: 'bg-rose-400/25 text-rose-50 ring-1 ring-rose-300/40',
    borderClass: 'border-rose-500/40',
    icon: '⚔️',
  },
  event: {
    heroBg: 'linear-gradient(145deg, #0b1e49 0%, #173473 55%, #0f2557 100%)',
    accentBg: 'bg-amber-400/20',
    accentText: 'text-amber-100',
    pillClass: 'bg-amber-400/25 text-amber-50 ring-1 ring-amber-300/40',
    borderClass: 'border-sky/35',
    icon: '🗓️',
  },
};

function DateTiles({ start, end, lang }: { start: string | null; end: string | null; lang: string }) {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;
  const rawE = end ? new Date(end) : null;
  const e = rawE && !Number.isNaN(rawE.getTime()) ? rawE : null;
  const monthFmt = new Intl.DateTimeFormat(lang, { month: 'short' });
  const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  const sameDay = !e || s.toDateString() === e.toDateString();

  const tile = (d: Date, sub?: string) => (
    <div className="flex min-w-[3.1rem] flex-col items-center overflow-hidden rounded-lg bg-white text-slate-900 shadow-sm">
      <span className="tnum px-1.5 pt-0.5 text-base font-black leading-tight">{d.getDate()}</span>
      <span className="w-full bg-amber-400 px-1 py-0.5 text-center text-[9px] font-extrabold uppercase tracking-wide text-slate-900">
        {monthFmt.format(d).replace(/\.$/, '')}
      </span>
      {sub && <span className="tnum bg-slate-900/90 px-1 py-0.5 text-[9px] font-bold text-white w-full text-center">{sub}</span>}
    </div>
  );

  if (sameDay) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        {tile(s)}
        <span className="tnum text-[10px] font-bold text-white/90">
          {timeFmt.format(s)}{e ? ` – ${timeFmt.format(e)}` : ''}
        </span>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-start gap-1">
      {tile(s, timeFmt.format(s))}
      {e && tile(e, timeFmt.format(e))}
    </div>
  );
}

function raidSourceOf(label: string, monName: string): HuntSource {
  if (/shadow/i.test(label) || /^shadow /i.test(monName)) return 'shadowRaid';
  if (/mega|primal/i.test(label) || /\bmega\b|primal/i.test(monName)) return 'megaRaid';
  return 'raid';
}

function maxSourceOf(ev: RichGameEvent, monName: string): HuntSource {
  return /gigantamax/i.test(`${ev.name} ${monName}`) ? 'gmax' : 'max';
}

const DAY_MS = 86_400_000;

/** Local Monday 00:00 of the week containing `ms` + `weekOffset` weeks. */
function startOfWeekMonday(ms: number, weekOffset: number): Date {
  const d = new Date(ms);
  const diffToMon = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon + weekOffset * 7, 0, 0, 0, 0);
  return mon;
}

function weekKindStyle(ev: GameEvent, rich?: RichGameEvent): { icon: string; badge: string; pill: string; bar: string } {
  const t = `${ev.eventType} ${ev.name}`.toLowerCase();
  if (rich?.template === 'max' || /max-mondays|max-battles|dynamax|gigantamax/.test(t)) {
    return { icon: '⚡', badge: 'bg-fuchsia-500/30 text-fuchsia-100', pill: 'border-fuchsia-400/40 bg-fuchsia-950/60', bar: TEMPLATE_THEMES.max.heroBg };
  }
  if (rich?.template === 'spotlight' || /spotlight/.test(t)) {
    return { icon: '✨', badge: 'bg-amber-400/30 text-amber-100', pill: 'border-amber-400/45 bg-amber-950/55', bar: TEMPLATE_THEMES.spotlight.heroBg };
  }
  if (rich?.template === 'community_day' || /community-day/.test(t)) {
    return { icon: '🌿', badge: 'bg-emerald-400/30 text-emerald-100', pill: 'border-emerald-400/45 bg-emerald-950/55', bar: TEMPLATE_THEMES.community_day.heroBg };
  }
  if (rich?.template === 'raid_day' || /raid-day|raid-hour/.test(t)) {
    return { icon: '⚔️', badge: 'bg-rose-400/30 text-rose-100', pill: 'border-rose-400/45 bg-rose-950/55', bar: TEMPLATE_THEMES.raid_day.heroBg };
  }
  if (/go-battle-league/.test(t)) {
    return { icon: '🏆', badge: 'bg-indigo-400/30 text-indigo-100', pill: 'border-indigo-400/45 bg-indigo-950/60', bar: 'linear-gradient(135deg, #312e81, #4338ca)' };
  }
  return { icon: '🗓️', badge: 'bg-sky/30 text-sky-100', pill: 'border-sky/40 bg-slate-900/60', bar: TEMPLATE_THEMES.event.heroBg };
}

function previewSpriteOf(ev: GameEvent, rich?: RichGameEvent): string | null {
  if (rich?.featured[0]?.image) return rich.featured[0].image;
  if (ev.extraData?.spotlight?.image) return ev.extraData.spotlight.image;
  if (ev.extraData?.raidbattles?.bosses?.[0]?.image) return ev.extraData.raidbattles.bosses[0].image;
  if (ev.extraData?.communityday?.spawns?.[0]?.image) return ev.extraData.communityday.spawns[0].image;
  if (rich?.spawnGroups[0]?.mons[0]?.image) return rich.spawnGroups[0].mons[0].image;
  if (rich?.raidGroups[0]?.mons[0]?.image) return rich.raidGroups[0].mons[0].image;
  return null;
}

/** Synthesizes an immediate in-app infographic view from a basic calendar event while richer details load. */
function fallbackRichEvent(ev: GameEvent): RichGameEvent {
  const t = `${ev.eventType} ${ev.name}`.toLowerCase();
  const template: EventTemplateKind =
    ev.eventType === 'max-mondays' || ev.eventType === 'max-battles' || /dynamax|gigantamax/.test(t)
      ? 'max'
      : ev.eventType === 'community-day'
        ? 'community_day'
        : ev.eventType === 'pokemon-spotlight-hour'
          ? 'spotlight'
          : ev.eventType === 'raid-day' || ev.eventType === 'raid-hour' || ev.eventType === 'raid-battles'
            ? 'raid_day'
            : 'event';

  const featured: EventDetailMon[] = [];
  const bonuses: EventBonusItem[] = [];
  const spawnGroups: RichGameEvent['spawnGroups'] = [];
  const raidGroups: RichGameEvent['raidGroups'] = [];

  if (ev.extraData?.spotlight) {
    const sp = ev.extraData.spotlight;
    if (sp.bonus) bonuses.push({ text: sp.bonus });
    const list = sp.list?.length ? sp.list : [{ name: sp.name, image: sp.image, canBeShiny: sp.canBeShiny }];
    for (const m of list) featured.push({ name: m.name, image: m.image, canBeShiny: !!m.canBeShiny });
  }
  if (ev.extraData?.communityday) {
    const cd = ev.extraData.communityday;
    for (const b of cd.bonuses ?? []) bonuses.push({ text: b.text, ...(b.image ? { image: b.image } : {}) });
    if (cd.spawns?.length) {
      spawnGroups.push({
        label: 'Spawns',
        mons: cd.spawns.map((m) => ({ name: m.name, image: m.image, canBeShiny: m.canBeShiny !== false })),
      });
    }
  }
  if (ev.extraData?.raidbattles?.bosses?.length) {
    const label = /mega/i.test(ev.name)
      ? 'Mega Raids'
      : /shadow/i.test(ev.name)
        ? 'Shadow Raids'
        : /5-star/i.test(ev.name)
          ? 'Five-Star Raids'
          : /3-star/i.test(ev.name)
            ? 'Three-Star Raids'
            : /1-star/i.test(ev.name)
              ? 'One-Star Raids'
              : 'Raids';
    raidGroups.push({
      label,
      mons: ev.extraData.raidbattles.bosses.map((b) => ({ name: b.name, image: b.image, canBeShiny: !!b.canBeShiny })),
    });
  }

  return {
    eventID: ev.eventID,
    name: ev.name,
    eventType: ev.eventType,
    heading: ev.heading,
    link: ev.link,
    image: ev.image,
    start: ev.start,
    end: ev.end,
    summary: null,
    template,
    featured,
    highlights: [],
    bonuses,
    spawnGroups,
    raidGroups,
    eggGroups: [],
    research: [],
    researchNote: null,
    rocket: [],
    newShinies: [],
    moves: [],
  };
}

/**
 * Automatic Monday → Sunday weekly calendar ("Ma semaine") inspired by GO Weekly infographics.
 * Desktop: full 7-column calendar + spanning multi-day event bars.
 * Mobile: compact 7-day picker strip (zero horizontal overflow) + selected day details + multi-day bars.
 */
function WeeklySchedule({
  now,
  richEvents,
  countHunts,
  onSelectEvent,
}: {
  now: number;
  richEvents: RichGameEvent[];
  countHunts: (e: RichGameEvent) => number;
  onSelectEvent: (ev: GameEvent, rich?: RichGameEvent) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const idx = useDataset().data;
  const liveEvents = useEvents();
  const [weekOffset, setWeekOffset] = useState(0);
  const todayDow = (new Date(now).getDay() + 6) % 7;
  const [mobileDay, setMobileDay] = useState(todayDow);
  const [shareOpen, setShareOpen] = useState(false);
  const [exporting, setExporting] = useState<'image' | 'pdf' | 'copy' | 'share' | null>(null);

  const richById = useMemo(() => new Map(richEvents.map((e) => [e.eventID, e])), [richEvents]);

  const { days, rangeLabel, dailyByDay, raidsByDay, multiDay } = useMemo(() => {
    const mon = startOfWeekMonday(now, weekOffset);
    const todayStr = new Date(now).toDateString();

    const wdFmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    const monthFmt = new Intl.DateTimeFormat(lang, { month: 'short' });
    const daysArr = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      const nextDay = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i + 1);
      const start = d.getTime();
      const end = nextDay.getTime() - 1;
      const wd = wdFmt.format(d).replace(/\.$/, '');
      return {
        index: i,
        date: d,
        start,
        end,
        isToday: d.toDateString() === todayStr,
        wdShort: wd.charAt(0).toUpperCase() + wd.slice(1),
        wdLetter: wd.charAt(0).toUpperCase(),
        dayNum: d.getDate(),
        monthShort: monthFmt.format(d).replace(/\.$/, ''),
      };
    });
    const weekStart = daysArr[0]!.start;
    const weekEnd = daysArr[6]!.end;
    const dayIndexOf = (ms: number) => {
      const found = daysArr.findIndex((d) => ms >= d.start && ms <= d.end);
      return found >= 0 ? found : ms < weekStart ? 0 : 6;
    };

    const first = daysArr[0]!;
    const last = daysArr[6]!;
    const label =
      first.monthShort === last.monthShort
        ? `${first.dayNum} – ${last.dayNum} ${last.monthShort}`
        : `${first.dayNum} ${first.monthShort} – ${last.dayNum} ${last.monthShort}`;

    // Merge ScrapedDuck live events + richEvents so mocked/server-only rich events also show up cleanly!
    const merged = new Map<string, GameEvent>();
    for (const e of liveEvents.data ?? []) merged.set(e.eventID, e);
    for (const r of richEvents) {
      if (!merged.has(r.eventID)) {
        merged.set(r.eventID, {
          eventID: r.eventID,
          name: r.name,
          eventType: r.eventType,
          heading: r.heading,
          link: r.link,
          image: r.image,
          start: r.start,
          end: r.end,
        });
      }
    }

    interface DayEntry {
      ev: GameEvent;
      rich?: RichGameEvent;
      startMs: number;
      endMs: number;
      sprite: string | null;
      hunts: number;
    }
    interface MultiEntry extends DayEntry {
      startCol: number; // 1..7
      endCol: number;   // 1..7
      startsBefore: boolean;
      endsAfter: boolean;
      sprites: string[];
    }

    const daily: DayEntry[][] = Array.from({ length: 7 }, () => []);
    const raids: DayEntry[][] = Array.from({ length: 7 }, () => []);
    const multi: MultiEntry[] = [];

    for (const ev of merged.values()) {
      if (!ev.start) continue;
      if (ev.eventType === 'season') continue;
      const sMs = new Date(ev.start).getTime();
      const eMs = ev.end ? new Date(ev.end).getTime() : sMs + 3600_000;
      if (Number.isNaN(sMs) || Number.isNaN(eMs)) continue;
      if (sMs > weekEnd || eMs < weekStart) continue;
      const durationMs = Math.max(0, eMs - sMs);
      // Skip ultra-long seasonal backdrops (> 21 days) so the weekly calendar stays crisp.
      if (durationMs > 21 * DAY_MS) continue;

      const rich = richById.get(ev.eventID);
      const hunts = countHunts(rich ?? fallbackRichEvent(ev));
      const sprite = rich?.featured[0]
        ? resolveHeroMon(rich, rich.featured[0], idx, undefined, lang).image
        : previewSpriteOf(ev, rich);

      if (ev.eventType === 'raid-battles') {
        if (sMs >= weekStart && sMs <= weekEnd) {
          const dayIdx = dayIndexOf(sMs);
          raids[dayIdx]!.push({ ev, rich, startMs: sMs, endMs: eMs, sprite, hunts });
        }
        continue;
      }

      const isSingleDay =
        durationMs <= 28 * 3600_000 ||
        ['raid-hour', 'pokemon-spotlight-hour', 'max-mondays', 'raid-day', 'community-day', 'research-day', 'go-battle-league'].includes(ev.eventType);

      if (isSingleDay) {
        const clamped = Math.max(weekStart, Math.min(weekEnd, sMs));
        const dayIdx = dayIndexOf(clamped);
        daily[dayIdx]!.push({ ev, rich, startMs: sMs, endMs: eMs, sprite, hunts });
      } else {
        const startCol = dayIndexOf(Math.max(sMs, weekStart)) + 1;
        const endCol = Math.max(startCol, dayIndexOf(Math.min(eMs, weekEnd)) + 1);
        const sprites: string[] = [];
        const addImg = (url?: string | null) => {
          if (url && !sprites.includes(url) && sprites.length < 4) sprites.push(url);
        };
        for (const m of rich?.featured ?? []) addImg(m.image);
        for (const g of rich?.spawnGroups ?? []) for (const m of g.mons) addImg(m.image);
        for (const g of rich?.raidGroups ?? []) for (const m of g.mons) addImg(m.image);
        addImg(sprite);
        multi.push({
          ev,
          rich,
          startMs: sMs,
          endMs: eMs,
          sprite,
          hunts,
          startCol,
          endCol,
          startsBefore: sMs < weekStart,
          endsAfter: eMs > weekEnd,
          sprites,
        });
      }
    }

    for (const arr of daily) arr.sort((a, b) => a.startMs - b.startMs);
    for (const arr of raids) arr.sort((a, b) => a.startMs - b.startMs);
    multi.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);

    return { days: daysArr, rangeLabel: label, dailyByDay: daily, raidsByDay: raids, multiDay: multi };
  }, [now, weekOffset, lang, liveEvents.data, richEvents, richById, countHunts]);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }), [lang]);
  const fmtTimeWindow = (sMs: number, eMs: number) => {
    const s = new Date(sMs);
    const e = new Date(eMs);
    if (s.getHours() === 0 && s.getMinutes() === 0 && eMs - sMs >= 22 * 3600_000) return t.weekly_all_day;
    return `${timeFmt.format(s)} – ${timeFmt.format(e)}`;
  };

  const openEntry = (ev: GameEvent, rich?: RichGameEvent) => {
    onSelectEvent(ev, rich);
  };

  const exportWeek = async (kind: 'image' | 'pdf' | 'copy' | 'share') => {
    setExporting(kind);
    const payload = { rangeLabel, days, raidsByDay, dailyByDay, multiDay };
    try {
      if (kind === 'pdf') {
        await exportWeeklyInfographicPdf(payload, idx, lang, t);
        toast(t.events_export_saved_pdf);
      } else {
        const { blob, filename } = await renderWeeklyInfographicImage(payload, idx, lang, t);
        if (kind === 'image') {
          downloadBlob(blob, filename);
          toast(t.events_export_saved_img);
        } else if (kind === 'copy') {
          await copyPicture(blob);
          toast(t.image_copied);
        } else {
          const res = await sharePictures([blob], [filename], `${t.weekly_title} · ${rangeLabel}`);
          if (res === 'needs-gesture') {
            downloadBlob(blob, filename);
            toast(t.events_export_saved_img);
          }
        }
      }
      setShareOpen(false);
    } catch {
      toast(t.err_generic);
    } finally {
      setExporting(null);
    }
  };

  const hasAnything = dailyByDay.some((d) => d.length > 0) || raidsByDay.some((d) => d.length > 0) || multiDay.length > 0;
  if (!hasAnything && liveEvents.isPending) return null;

  const selectedDay = days[Math.min(6, Math.max(0, mobileDay))]!;
  const selectedRaids = raidsByDay[selectedDay.index] ?? [];
  const selectedDaily = dailyByDay[selectedDay.index] ?? [];

  const renderRaidPill = (item: (typeof raidsByDay)[number][number], compact = false) => {
    const isMega = /mega/i.test(item.ev.name);
    const isShadow = /shadow/i.test(item.ev.name);
    const bosses = item.ev.extraData?.raidbattles?.bosses ?? [];
    const title = eventTitle(item.ev.name, idx?.speciesByDex, lang);
    return (
      <button
        key={item.ev.eventID}
        type="button"
        onClick={() => openEntry(item.ev, item.rich)}
        className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition hover:brightness-110 ${
          isMega ? 'border-cyan-400/45 bg-cyan-950/60' : isShadow ? 'border-purple-400/45 bg-purple-950/60' : 'border-rose-400/45 bg-rose-950/55'
        }`}
      >
        <div className="flex shrink-0 -space-x-2">
          {(bosses.length ? bosses.slice(0, 2) : item.sprite ? [{ image: item.sprite, name: item.ev.name }] : []).map((b, i) => (
            <img key={i} src={b.image} alt="" width={26} height={26} loading="lazy" className="h-6 w-6 object-contain drop-shadow" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase tracking-wide text-white/75">
            {isMega ? (lang === 'fr' ? 'Méga' : 'Mega') : isShadow ? (lang === 'fr' ? 'Obscur' : 'Shadow') : '5★'} · {t.weekly_raids_new}
          </div>
          <div className={`font-bold leading-tight text-white ${compact ? 'line-clamp-2 text-[10px]' : 'truncate text-xs'}`}>{title}</div>
        </div>
      </button>
    );
  };

  const renderDailyCard = (item: (typeof dailyByDay)[number][number], compact = false) => {
    const st = weekKindStyle(item.ev, item.rich);
    const title = eventTitle(item.ev.name, idx?.speciesByDex, lang);
    return (
      <button
        key={item.ev.eventID}
        type="button"
        onClick={() => openEntry(item.ev, item.rich)}
        className={`flex w-full flex-col rounded-xl border p-1.5 text-left transition hover:brightness-110 ${st.pill} ${item.hunts > 0 ? 'ring-1 ring-emerald-400' : ''}`}
      >
        <div className="flex items-center gap-1">
          <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold ${st.badge}`}>
            <span aria-hidden="true">{st.icon}</span>
            <span className="tnum">{timeFmt.format(new Date(item.startMs))}</span>
          </span>
          {item.hunts > 0 && <span className="ml-auto rounded-full bg-go px-1 text-[8px] font-bold text-white">★{item.hunts}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {item.sprite && (
            <img src={item.sprite} alt="" width={compact ? 30 : 38} height={compact ? 30 : 38} loading="lazy" className={`${compact ? 'h-7 w-7' : 'h-9 w-9'} shrink-0 object-contain drop-shadow`} />
          )}
          <div className="min-w-0 flex-1">
            <div className={`font-bold leading-tight text-white ${compact ? 'line-clamp-2 text-[11px]' : 'text-xs'}`}>{title}</div>
            {!compact && <div className="tnum mt-0.5 text-[10px] text-white/75">{fmtTimeWindow(item.startMs, item.endMs)}</div>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <section
      aria-label={t.weekly_title}
      className="mb-5 overflow-hidden rounded-2xl border border-sky/30 p-3 text-white shadow-card sm:p-4"
      style={{ background: 'linear-gradient(155deg, #091736 0%, #12285a 58%, #0c1d42 100%)' }}
    >
      {/* Header: title, range, week switcher */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-black tracking-tight sm:text-lg">📅 {t.weekly_title}</h2>
            <span className="tnum text-xs font-semibold text-sky-200 sm:text-sm">{rangeLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="mr-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/25"
          >
            🖼️ {t.weekly_export_btn}
          </button>
          <button
            type="button"
            aria-label={t.weekly_prev}
            onClick={() => { setWeekOffset((w) => w - 1); setMobileDay(0); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white transition hover:bg-white/20"
          >
            ‹
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => { setWeekOffset(0); setMobileDay(todayDow); }}
              className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25"
            >
              {t.weekly_this_week}
            </button>
          )}
          <button
            type="button"
            aria-label={t.weekly_next}
            onClick={() => { setWeekOffset((w) => w + 1); setMobileDay(0); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white transition hover:bg-white/20"
          >
            ›
          </button>
        </div>
      </div>

      {/* DESKTOP: 7-column Mon → Sun visual calendar */}
      <div className="hidden md:grid md:grid-cols-7 md:gap-1.5">
        {days.map((d) => {
          const dRaids = raidsByDay[d.index] ?? [];
          const dEvents = dailyByDay[d.index] ?? [];
          return (
            <div
              key={d.index}
              className={`flex min-h-[126px] flex-col rounded-xl border p-1.5 ${
                d.isToday ? 'border-amber-300/80 bg-white/10 ring-1 ring-amber-300/40' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-white/10 pb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-white/75">{d.wdShort}</span>
                <span className={`tnum rounded-md px-1.5 py-0.5 text-[11px] font-black leading-none ${d.isToday ? 'bg-amber-400 text-slate-950' : 'bg-white/15 text-white'}`}>
                  {d.dayNum}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {dRaids.map((r) => renderRaidPill(r, true))}
                {dEvents.map((e) => renderDailyCard(e, true))}
              </div>
            </div>
          );
        })}
      </div>

      {/* MOBILE: compact 7-day pill selector + selected day feed (fits 360px cleanly with 0 overflow) */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label={t.weekly_title}>
          {days.map((d) => {
            const count = (raidsByDay[d.index]?.length ?? 0) + (dailyByDay[d.index]?.length ?? 0);
            const hasHunts = (dailyByDay[d.index] ?? []).some((x) => x.hunts > 0);
            const active = d.index === selectedDay.index;
            return (
              <button
                key={d.index}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileDay(d.index)}
                className={`relative flex flex-col items-center rounded-xl border py-1.5 transition ${
                  active
                    ? 'border-amber-300 bg-white text-slate-950 shadow-sm'
                    : d.isToday
                      ? 'border-amber-300/60 bg-white/15 text-white'
                      : 'border-white/10 bg-white/[0.05] text-white/85'
                }`}
              >
                {hasHunts && (
                  <span className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-go text-[7px] font-bold text-white" aria-hidden="true">★</span>
                )}
                <span className="text-[10px] font-bold uppercase opacity-75">{d.wdLetter}</span>
                <span className="tnum text-sm font-black leading-tight">{d.dayNum}</span>
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {count > 0 && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-go' : 'bg-amber-300'}`} />}
                  {count > 1 && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-sky' : 'bg-fuchsia-300'}`} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white/90">
            <span>{selectedDay.wdShort} {selectedDay.dayNum} {selectedDay.monthShort}</span>
            {selectedDay.isToday && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">{t.weekly_today}</span>}
          </div>
          {selectedRaids.length === 0 && selectedDaily.length === 0 ? (
            <p className="text-xs text-white/65">{t.weekly_empty_day}</p>
          ) : (
            <div className="space-y-1.5">
              {selectedRaids.map((r) => renderRaidPill(r, false))}
              {selectedDaily.map((e) => renderDailyCard(e, false))}
            </div>
          )}
        </div>
      </div>

      {/* Multi-day spanning events bar (exact Mon→Sun columns on desktop, stacked strips on mobile) */}
      {multiDay.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">{t.weekly_multiday}</p>
          {/* Desktop aligned bars */}
          <div className="hidden md:grid md:grid-cols-7 md:gap-1.5">
            {multiDay.map((m) => {
              const st = weekKindStyle(m.ev, m.rich);
              const title = eventTitle(m.ev.name, idx?.speciesByDex, lang);
              return (
                <button
                  key={m.ev.eventID}
                  type="button"
                  onClick={() => openEntry(m.ev, m.rich)}
                  style={{ gridColumn: `${m.startCol} / ${m.endCol + 1}`, background: st.bar }}
                  className={`flex items-center gap-2 rounded-xl border border-white/20 px-2.5 py-1.5 text-left shadow-sm transition hover:brightness-110 ${m.hunts > 0 ? 'ring-1 ring-emerald-400' : ''}`}
                >
                  {m.startsBefore && <span className="text-xs opacity-70" aria-hidden="true">‹</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-extrabold text-white">{title}</span>
                      {m.hunts > 0 && <span className="shrink-0 rounded-full bg-go px-1.5 py-0.5 text-[9px] font-bold text-white">★{m.hunts}</span>}
                    </div>
                  </div>
                  {m.sprites.length > 0 && (
                    <div className="flex shrink-0 -space-x-1.5">
                      {m.sprites.slice(0, 3).map((src, i) => (
                        <img key={i} src={src} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 object-contain drop-shadow" />
                      ))}
                    </div>
                  )}
                  {m.endsAfter && <span className="text-xs opacity-70" aria-hidden="true">›</span>}
                </button>
              );
            })}
          </div>
          {/* Mobile stacked multi-day strips */}
          <div className="space-y-1.5 md:hidden">
            {multiDay.map((m) => {
              const st = weekKindStyle(m.ev, m.rich);
              const title = eventTitle(m.ev.name, idx?.speciesByDex, lang);
              const sDay = days[m.startCol - 1]!;
              const eDay = days[m.endCol - 1]!;
              return (
                <button
                  key={m.ev.eventID}
                  type="button"
                  onClick={() => openEntry(m.ev, m.rich)}
                  style={{ background: st.bar }}
                  className={`flex w-full items-center gap-2 rounded-xl border border-white/20 px-2.5 py-2 text-left shadow-sm ${m.hunts > 0 ? 'ring-1 ring-emerald-400' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-extrabold text-white">{title}</span>
                      {m.hunts > 0 && <span className="shrink-0 rounded-full bg-go px-1.5 py-0.5 text-[9px] font-bold text-white">★{m.hunts}</span>}
                    </div>
                    <div className="tnum text-[10px] text-white/75">
                      {m.startsBefore ? '‹ ' : ''}{sDay.wdShort} {sDay.dayNum} → {eDay.wdShort} {eDay.dayNum}{m.endsAfter ? ' ›' : ''}
                    </div>
                  </div>
                  {m.sprites.length > 0 && (
                    <div className="flex shrink-0 -space-x-1.5">
                      {m.sprites.slice(0, 3).map((src, i) => (
                        <img key={i} src={src} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 object-contain drop-shadow" />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title={`📅 ${t.weekly_export_title}`}>
        {shareOpen && (
          <div className="space-y-2.5">
            <p className="text-xs text-ink-2">{t.weekly_title} · {rangeLabel}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button tone="primary" disabled={!!exporting} onClick={() => exportWeek('image')}>
                {exporting === 'image' ? t.events_export_working : `🖼️ ${t.events_export_image}`}
              </Button>
              <Button disabled={!!exporting} onClick={() => exportWeek('pdf')}>
                {exporting === 'pdf' ? t.events_export_working : `📄 ${t.events_export_pdf}`}
              </Button>
              {canCopyPicture() && (
                <Button tone="ghost" className="bg-paper-2" disabled={!!exporting} onClick={() => exportWeek('copy')}>
                  {exporting === 'copy' ? t.events_export_working : `📋 ${t.events_export_copy}`}
                </Button>
              )}
              {canSharePictures() && (
                <Button tone="ghost" className="bg-paper-2" disabled={!!exporting} onClick={() => exportWeek('share')}>
                  {exporting === 'share' ? t.events_export_working : `↗ ${t.events_export_share}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}

/** Reusable modal for opening any event's MyDexPoGo infographic from other tabs (Max Battles, Spawns, etc.). */
export function EventDetailModal({
  event,
  now,
  onClose,
}: {
  event: (Omit<GameEvent, 'heading'> & { heading?: string }) | null;
  now: number;
  onClose: () => void;
}) {
  const richList = useRichEvents();
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const [counterTarget, setCounterTarget] = useState<ToolPokemon | null>(null);

  const cached = event ? richList.data?.find((r) => r.eventID === event.eventID) : undefined;
  const needsFetch = !!event && !cached;
  const detailQuery = useQuery({
    queryKey: ['live', 'rich-event', event?.eventID],
    queryFn: () => api<{ event: RichGameEvent }>(`/game/events/${encodeURIComponent(event!.eventID)}`).then((r) => r.event),
    enabled: needsFetch,
    staleTime: 15 * 60_000,
    retry: false,
  });

  const activeEvent = event
    ? (cached ?? detailQuery.data ?? fallbackRichEvent({ ...event, heading: event.heading ?? '' }))
    : null;
  const loadingDetails = needsFetch && detailQuery.isFetching && !detailQuery.data;

  const pickCounter = (m: EventDetailMon, resolved?: ToolPokemon | null) => {
    const found = resolved ?? fromImage(m.image, m.name) ?? tools.data?.pokemon.find((p) => p.dex === dexFromImage(m.image) && !p.mega);
    if (found) setCounterTarget(found);
  };

  return (
    <>
      <EventInfographicSheet
        event={activeEvent}
        loadingDetails={loadingDetails}
        now={now}
        onClose={onClose}
        onPickCounter={pickCounter}
      />
      <CountersSheet target={counterTarget} onClose={() => setCounterTarget(null)} />
    </>
  );
}

/** Main Events feed: automatic multi-template visual cards + full interactive infographic sheet on tap. */
export function EventFeed({ now }: { now: number }) {
  const t = useT();
  const { lang } = useLang();
  const q = useRichEvents();
  const dataset = useDataset();
  const idx = dataset.data;
  const tools = useTools();
  const fromImage = useFromImage(tools.data);
  const { hasMissing, isWanted, isWantedKey } = useMissingHunts();
  const [statusFilter, setStatusFilter] = useState<'all' | 'current' | 'upcoming'>('all');
  const [catFilter, setCatFilter] = useState<'all' | 'raids' | 'max' | 'spotlight' | 'events'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyHunts, setOnlyHunts] = useState(false);
  const [selected, setSelected] = useState<{ event: RichGameEvent; needsFetch: boolean } | null>(null);
  const [counterTarget, setCounterTarget] = useState<ToolPokemon | null>(null);

  const detailQuery = useQuery({
    queryKey: ['live', 'rich-event', selected?.event.eventID],
    queryFn: () =>
      api<{ event: RichGameEvent }>(`/game/events/${encodeURIComponent(selected!.event.eventID)}`).then((r) => r.event),
    enabled: !!selected?.needsFetch,
    staleTime: 15 * 60_000,
    retry: false,
  });
  const activeEvent = selected
    ? (selected.needsFetch ? (detailQuery.data ?? selected.event) : selected.event)
    : null;
  const loadingDetails = !!selected?.needsFetch && detailQuery.isFetching && !detailQuery.data;

  const countHunts = (e: RichGameEvent): number => {
    if (!hasMissing) return 0;
    const seen = new Set<string>();
    const check = (m: EventDetailMon, src: HuntSource) => {
      if (!seen.has(m.image) && isWanted(m.image, m.name, src, m.canBeShiny)) seen.add(m.image);
    };
    const featSrc: HuntSource = e.template === 'max' ? maxSourceOf(e, e.name) : e.template === 'raid_day' ? 'megaRaid' : 'wild';
    for (const m of e.featured) {
      const hero = resolveHeroMon(e, m, idx, tools.data, lang);
      if (
        !seen.has(m.image) &&
        (isWanted(m.image, m.name, featSrc, m.canBeShiny) ||
          (hero.counterTarget && isWantedKey(hero.counterTarget.key, featSrc, m.canBeShiny)))
      ) {
        seen.add(m.image);
      }
    }
    for (const g of e.spawnGroups) for (const m of g.mons) check(m, 'wild');
    for (const g of e.raidGroups) for (const m of g.mons) check(m, raidSourceOf(g.label, m.name));
    for (const g of e.eggGroups) for (const m of g.mons) check(m, 'egg');
    for (const m of e.research) check(m, 'research');
    for (const m of e.rocket) check(m, 'rocket');
    return seen.size;
  };

  const events = useMemo(() => {
    const all = (q.data ?? []).filter((e) => eventStatus(e, now) !== 'past');
    return all.map((e) => ({ e, status: eventStatus(e, now), hunts: countHunts(e) }));
  }, [q.data, now, hasMissing, isWanted, isWantedKey, idx, tools.data, lang]);

  const anyHunts = events.some((x) => x.hunts > 0);
  const normSearch = searchQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matchesCat = (e: RichGameEvent) => {
    if (catFilter === 'all') return true;
    if (catFilter === 'raids') return e.template === 'raid_day' || e.eventType === 'raid-battles' || e.eventType === 'raid-hour' || e.raidGroups.length > 0;
    if (catFilter === 'max') return e.template === 'max' || e.eventType === 'max-mondays' || e.eventType === 'max-battles';
    if (catFilter === 'spotlight') return e.template === 'spotlight' || e.template === 'community_day';
    return e.template === 'event';
  };
  const matchesSearch = (e: RichGameEvent) => {
    if (!normSearch) return true;
    const title = eventTitle(e.name, idx?.speciesByDex, lang);
    const mons = [...e.featured, ...e.spawnGroups.flatMap((g) => g.mons), ...e.raidGroups.flatMap((g) => g.mons), ...e.research]
      .map((m) => `${m.name} ${liveName(m.name, m.image, idx, lang)}`)
      .join(' ');
    const hay = `${title} ${e.name} ${mons}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return hay.includes(normSearch);
  };
  const visible = events.filter(
    (x) => (statusFilter === 'all' || x.status === statusFilter) && (!onlyHunts || x.hunts > 0) && matchesCat(x.e) && matchesSearch(x.e),
  );
  const current = visible.filter((x) => x.status === 'current');
  const upcoming = visible.filter((x) => x.status === 'upcoming');

  const pickCounter = (m: EventDetailMon, resolved?: ToolPokemon | null) => {
    const found = resolved ?? fromImage(m.image, m.name) ?? tools.data?.pokemon.find((p) => p.dex === dexFromImage(m.image) && !p.mega);
    if (found) setCounterTarget(found);
  };

  if (q.isPending) return <Spinner />;
  if (q.isError && !events.length) return null;

  const renderCard = ({ e, hunts }: { e: RichGameEvent; hunts: number }) => {
    const theme = TEMPLATE_THEMES[e.template];
    const cd = countdownOf(e, lang, now);
    const title = eventTitle(e.name, idx?.speciesByDex, lang);
    const previewMons: EventDetailMon[] = [];
    const pushPreview = (list: EventDetailMon[]) => {
      for (const m of list) {
        if (previewMons.length >= 6) break;
        if (!previewMons.some((x) => x.image === m.image)) previewMons.push(m);
      }
    };
    pushPreview(e.featured.map((m) => {
      const h = resolveHeroMon(e, m, idx, tools.data, lang);
      return { ...m, image: h.image, name: h.label };
    }));
    for (const h of e.highlights) if (h.mons) pushPreview(h.mons);
    for (const g of e.spawnGroups) pushPreview(g.mons);
    for (const g of e.raidGroups) pushPreview(g.mons);
    pushPreview(e.research);

    const hasDebut = e.highlights.some((h) => h.kind === 'debut');
    const hasBg = e.highlights.some((h) => h.kind === 'background');
    const hasNewShiny = e.newShinies.length > 0;

    return (
      <li key={e.eventID}>
        <button
          type="button"
          onClick={() => setSelected({ event: e, needsFetch: false })}
          className={`card w-full overflow-hidden border p-0 text-left transition active:scale-[0.99] ${hunts > 0 ? 'ring-2 ring-go/70' : theme.borderClass}`}
        >
          {/* Poster header band */}
          <div className="relative overflow-hidden px-3 py-3 text-white" style={{ background: theme.heroBg }}>
            {e.image && !e.image.includes('default') && (
              <img
                src={e.image}
                alt=""
                loading="lazy"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity"
              />
            )}
            <div className="relative flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.pillClass}`}>
                    <span aria-hidden="true">{theme.icon}</span>
                    {t.events_templates[e.template] ?? e.heading}
                  </span>
                  {cd && (
                    <span className="tnum rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white">
                      {cd.kind === 'ends' ? t.countdown_ends_in(cd.text) : t.countdown_starts_in(cd.text)}
                    </span>
                  )}
                  {hunts > 0 && (
                    <span className="tnum rounded-full bg-go px-2 py-0.5 text-[10px] font-bold text-white">
                      ★ {t.events_hunts_count(hunts)}
                    </span>
                  )}
                </div>
                <h3 className="mt-1.5 text-base font-extrabold leading-snug drop-shadow-sm">{title}</h3>
                {/* Highlight quick tags */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {hasDebut && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">{t.events_debut}</span>}
                  {hasNewShiny && <span className="rounded bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">✨ {t.events_new_shiny}</span>}
                  {hasBg && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">🎴 {t.events_special_bg}</span>}
                  {e.goPass && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">🎫 {t.events_gopass}</span>}
                  {e.bonuses.length > 0 && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">{t.events_bonus_count(e.bonuses.length)}</span>}
                </div>
              </div>
              <DateTiles start={e.start} end={e.end} lang={lang} />
            </div>
          </div>

          {/* Preview body: top Pokémon sprites + top 2 bonuses */}
          {(previewMons.length > 0 || e.bonuses.length > 0) && (
            <div className="space-y-2 px-3 py-2.5">
              {previewMons.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                    {previewMons.map((m) => (
                      <span key={m.image} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-paper-2/70">
                        <img src={m.image} alt={liveName(m.name, m.image, idx, lang)} width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />
                        {m.canBeShiny && <Sparkle className="absolute right-0 top-0 text-shiny" />}
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-sky">{t.events_open_sheet} ›</span>
                </div>
              )}
              {e.bonuses.length > 0 && (
                <ul className="space-y-1 text-xs text-ink-2">
                  {e.bonuses.slice(0, 2).map((b, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {b.image ? (
                        <img src={b.image} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 object-contain" />
                      ) : (
                        <span className="text-go" aria-hidden="true">•</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{bonusFr(b.text, idx?.speciesByDex, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </button>
      </li>
    );
  };

  return (
    <>
      <WeeklySchedule
        now={now}
        richEvents={q.data ?? []}
        countHunts={countHunts}
        onSelectEvent={(ev, rich) =>
          setSelected(rich ? { event: rich, needsFetch: false } : { event: fallbackRichEvent(ev), needsFetch: true })
        }
      />

      {events.length > 4 && (
        <div className="relative mb-2">
          <input
            type="search"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.events_search}
            aria-label={t.events_search}
            className="min-h-10 w-full rounded-xl border border-line bg-card px-3 pr-9 text-[16px] placeholder:text-ink-3 focus:border-sky"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label={t.search_clear} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2">
              ✕
            </button>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} className="min-h-8 px-2.5 text-xs">{t.filter_all}</Chip>
        <Chip active={statusFilter === 'current'} onClick={() => setStatusFilter('current')} className="min-h-8 px-2.5 text-xs">
          {t.events_now} {events.filter((x) => x.status === 'current').length > 0 && <span className="tnum opacity-75">· {events.filter((x) => x.status === 'current').length}</span>}
        </Chip>
        <Chip active={statusFilter === 'upcoming'} onClick={() => setStatusFilter('upcoming')} className="min-h-8 px-2.5 text-xs">
          {t.events_upcoming}
        </Chip>
        {anyHunts && (
          <Chip active={onlyHunts} onClick={() => setOnlyHunts((v) => !v)} className="min-h-8 px-2.5 text-xs">{t.game_my_hunts}</Chip>
        )}
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {([
          ['all', t.events_cat_all],
          ['events', t.events_cat_events],
          ['spotlight', t.events_cat_spotlight],
          ['raids', t.events_cat_raids],
          ['max', t.events_cat_max],
        ] as const).map(([cid, label]) => (
          <Chip key={cid} active={catFilter === cid} onClick={() => setCatFilter(cid)} className="min-h-7 shrink-0 px-2.5 text-[11px]">
            {label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 && <Empty>{t.nothing_here}</Empty>}

      {current.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-bold">{t.events_now} <span className="tnum font-normal text-ink-3">{current.length}</span></h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{current.map(renderCard)}</ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-bold">{t.events_upcoming} <span className="tnum font-normal text-ink-3">{upcoming.length}</span></h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{upcoming.map(renderCard)}</ul>
        </section>
      )}

      <EventInfographicSheet
        event={activeEvent}
        loadingDetails={loadingDetails}
        now={now}
        onClose={() => setSelected(null)}
        onPickCounter={pickCounter}
      />
      <CountersSheet target={counterTarget} onClose={() => setCounterTarget(null)} />
    </>
  );
}

/** Full multi-section visual infographic sheet tailored to the event's template. */
function EventInfographicSheet({
  event,
  loadingDetails = false,
  now,
  onClose,
  onPickCounter,
}: {
  event: RichGameEvent | null;
  loadingDetails?: boolean;
  now: number;
  onClose: () => void;
  onPickCounter: (m: EventDetailMon, resolved?: ToolPokemon | null) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const idx = useDataset().data;
  const tools = useTools();
  const { isWanted } = useMissingHunts();
  const [exporting, setExporting] = useState<'image' | 'pdf' | 'copy' | 'share' | null>(null);

  if (!event) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const theme = TEMPLATE_THEMES[event.template];
  const title = eventTitle(event.name, idx?.speciesByDex, lang);
  const cd = countdownOf(event, lang, now);
  const freeBonuses = event.bonuses.filter((b) => !b.paid);
  const deluxeBonuses = event.bonuses.filter((b) => b.paid);
  const moveNames = tools.data?.moveNames;

  const exportEvent = async (kind: 'image' | 'pdf' | 'copy' | 'share') => {
    setExporting(kind);
    try {
      if (kind === 'pdf') {
        await exportEventInfographicPdf(event, idx, lang, t, tools.data);
        toast(t.events_export_saved_pdf);
      } else {
        const { blob, filename } = await renderEventInfographicImage(event, idx, lang, t, tools.data);
        if (kind === 'image') {
          downloadBlob(blob, filename);
          toast(t.events_export_saved_img);
        } else if (kind === 'copy') {
          await copyPicture(blob);
          toast(t.image_copied);
        } else {
          const res = await sharePictures([blob], [filename], title);
          if (res === 'needs-gesture') {
            downloadBlob(blob, filename);
            toast(t.events_export_saved_img);
          }
        }
      }
    } catch {
      toast(t.err_generic);
    } finally {
      setExporting(null);
    }
  };

  const highlightBadge = (kind: RichGameEvent['highlights'][number]['kind']) => {
    switch (kind) {
      case 'debut': return t.events_debut;
      case 'shiny': return `✨ ${t.events_new_shiny}`;
      case 'background': return `🎴 ${t.events_special_bg}`;
      case 'move': return `💥 ${t.events_new_move}`;
      case 'super_max': return `⚡ ${t.events_super_max}`;
      case 'evolution': return `🧬 ${t.events_evo_req}`;
      default: return t.events_highlights;
    }
  };

  const renderMonTile = (m: EventDetailMon, src: HuntSource, asCounter = false) => {
    const wanted = isWanted(m.image, m.name, src, m.canBeShiny);
    const dex = dexFromImage(m.image);
    const label = liveName(m.name, m.image, idx, lang);
    const { main, form } = splitLiveLabel(label);
    const content = (
      <span className="flex flex-col items-center text-center">
        <span className="relative">
          <img src={m.image} alt="" width={52} height={52} loading="lazy" className="h-[52px] w-[52px] object-contain" />
          {m.canBeShiny && <Sparkle className="absolute -right-1 top-0 text-shiny" />}
          {wanted && <span className="absolute -left-1 top-0 rounded-full bg-go px-1 text-[8px] font-bold leading-3.5 text-white">★</span>}
          {asCounter && <span className="absolute -bottom-0.5 -right-1 rounded-full bg-card/90 px-0.5 text-[9px] leading-none shadow-sm" aria-hidden="true">⚔️</span>}
          {m.newShiny && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-400 px-1 text-[8px] font-black uppercase text-slate-950">
              {t.new_badge}
            </span>
          )}
        </span>
        <span className="mt-1 line-clamp-1 w-[4.8rem] text-[11px] font-semibold leading-tight">{main}</span>
        {form && <span className="line-clamp-2 w-[4.8rem] text-[9.5px] font-medium leading-tight text-sky">{form}</span>}
      </span>
    );
    const cls = `rounded-xl p-1 transition hover:bg-paper-2 ${wanted ? 'bg-go-soft/55 ring-2 ring-go/70' : ''}`;
    if (asCounter) {
      return (
        <button key={m.image} type="button" onClick={() => onPickCounter(m)} className={cls} title={t.counters_title(label)}>
          {content}
        </button>
      );
    }
    return dex ? (
      <Link key={m.image} to={`/dex/${dex}`} onClick={onClose} className={cls}>
        {content}
      </Link>
    ) : (
      <span key={m.image} className={cls}>{content}</span>
    );
  };

  const renderBonusList = (items: EventBonusItem[]) => {
    // Group bonuses by optional group label (e.g. "Palier 1 · Rang 10", or extended time window).
    const grouped = new Map<string, EventBonusItem[]>();
    for (const b of items) {
      const k = b.group ?? '';
      (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(b);
    }
    return (
      <div className="space-y-2.5">
        {[...grouped.entries()].map(([group, list]) => (
          <div key={group || '_main'}>
            {group && (
              <div className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-paper-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">
                {eventLabelFr(group, lang, idx?.speciesByDex, moveNames)}
              </div>
            )}
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {list.map((b, i) => (
                <li key={i} className={`flex items-center gap-2 rounded-xl border p-2 text-xs ${b.paid ? 'border-amber-400/50 bg-shiny-soft/25' : 'border-line bg-paper-2/40'}`}>
                  {b.image ? (
                    <img src={b.image} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-go-soft text-xs font-bold text-go-ink">★</span>
                  )}
                  <span className="min-w-0 flex-1 font-medium leading-snug">{bonusFr(b.text, idx?.speciesByDex, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Sheet open={!!event} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Hero infographic banner */}
        <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-md" style={{ background: theme.heroBg }}>
          {event.image && !event.image.includes('default') && (
            <img src={event.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity" />
          )}
          <div className="relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.pillClass}`}>
                  {theme.icon} {t.events_templates[event.template] ?? event.heading}
                </span>
                {cd && (
                  <span className="tnum rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold">
                    {cd.kind === 'ends' ? t.countdown_ends_in(cd.text) : t.countdown_starts_in(cd.text)}
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 text-lg font-black leading-tight">{title}</h2>
              {event.summary && <p className="mt-1 text-xs leading-relaxed text-white/85">{eventTextFr(event.summary, idx?.speciesByDex, lang, moveNames)}</p>}
            </div>
            <DateTiles start={event.start} end={event.end} lang={lang} />
          </div>

          {/* Max Battle / Spotlight / Raid Day centered hero showcase */}
          {(event.template === 'max' || event.template === 'spotlight' || event.template === 'raid_day') && event.featured.length > 0 && (
            <div className="relative mt-3 flex flex-wrap items-center justify-center gap-4 rounded-xl bg-black/25 p-3">
              {event.featured.map((m) => {
                const hero = resolveHeroMon(event, m, idx, tools.data, lang);
                const isRaid = event.template === 'raid_day';
                return (
                  <div key={m.image} className="flex flex-col items-center text-center">
                    <div className="relative">
                      <img src={hero.image} alt={hero.label} width={96} height={96} className="h-[96px] w-[96px] object-contain drop-shadow-lg" />
                      {m.canBeShiny && <Sparkle className="absolute right-0 top-0 h-5 w-5 text-amber-300" />}
                    </div>
                    <span className="mt-1 text-sm font-extrabold">{hero.label}</span>
                    {hero.types.length > 0 && (
                      <div className="mt-1 flex flex-wrap justify-center gap-1">
                        {hero.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                      {m.newShiny && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950">✨ {t.events_new_shiny}</span>}
                      {isRaid && (
                        <button
                          type="button"
                          onClick={() => onPickCounter(m, hero.counterTarget)}
                          className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-white/30"
                        >
                          ⚔️ {t.tool_counters}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subtle loading hint when fetching full infographic details for a calendar-only event */}
        {loadingDetails && (
          <p className="text-center text-xs text-ink-3">{t.events_loading_details}</p>
        )}

        {/* Highlights: Pokémon Debut, New Shiny, Special Background, New Move, Super Max, Evo Requirement */}
        {event.highlights.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_highlights}</h3>
            {event.highlights.map((h, i) => (
              <div key={i} className="rounded-xl border border-line bg-paper-2/40 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={h.kind === 'debut' || h.kind === 'shiny' ? 'shiny' : h.kind === 'super_max' ? 'datamined' : 'grass'}>
                    {highlightBadge(h.kind)}
                  </Badge>
                  <span className="text-xs font-bold">{eventLabelFr(h.title, lang, idx?.speciesByDex, moveNames)}</span>
                </div>
                {h.text && <p className="mt-1 text-xs leading-relaxed text-ink-2">{eventTextFr(h.text, idx?.speciesByDex, lang, moveNames)}</p>}
                {h.mons && h.mons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.mons.map((m) => {
                      const ctxText = `${event.name} ${h.title} ${m.name}`;
                      const src: HuntSource =
                        event.template === 'raid_day'
                          ? /\bshadow\b/i.test(ctxText)
                            ? 'shadowRaid'
                            : /\bmega\b|primal/i.test(ctxText)
                              ? 'megaRaid'
                              : 'raid'
                          : 'wild';
                      return renderMonTile(m, src);
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Free & milestone bonuses */}
        {freeBonuses.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">
              {event.ticket ? t.events_bonuses_free : t.events_bonuses}
            </h3>
            {renderBonusList(freeBonuses)}
          </section>
        )}

        {/* Wild spawns (including dated sub-groups like Additional Spawns Dec 4-7 or Day 1 / Day 2) */}
        {event.spawnGroups.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_spawns}</h3>
            {event.spawnGroups.map((g, i) => (
              <div key={i} className="rounded-xl border border-line p-2.5">
                {g.label !== 'Spawns' && (
                  <p className="mb-1.5 text-xs font-bold text-ink-2">{eventLabelFr(g.label, lang, idx?.speciesByDex, moveNames)}</p>
                )}
                <div className="flex flex-wrap gap-1.5">{g.mons.map((m) => renderMonTile(m, 'wild'))}</div>
              </div>
            ))}
          </section>
        )}

        {/* Tiered Raids (1★, 3★, 5★, Mega, Shadow) — tap any boss for raid counters! */}
        {event.raidGroups.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_raids}</h3>
            {event.raidGroups.map((g, i) => (
              <div key={i} className="rounded-xl border border-line p-2.5">
                <p className="mb-1.5 text-xs font-bold text-ink-2">{eventLabelFr(g.label, lang, idx?.speciesByDex, moveNames)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.mons.map((m) => renderMonTile(m, raidSourceOf(g.label, m.name), true))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Eggs by distance */}
        {event.eggGroups.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_eggs}</h3>
            {event.eggGroups.map((g, i) => (
              <div key={i} className="rounded-xl border border-line p-2.5">
                <p className="mb-1.5 text-xs font-bold text-ink-2">{eventLabelFr(g.label, lang, idx?.speciesByDex, moveNames)}</p>
                <div className="flex flex-wrap gap-1.5">{g.mons.map((m) => renderMonTile(m, 'egg'))}</div>
              </div>
            ))}
          </section>
        )}

        {/* Field Research */}
        {(event.research.length > 0 || event.researchNote) && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_research}</h3>
            <div className="rounded-xl border border-line p-2.5">
              {event.researchNote && <p className="mb-2 text-xs text-ink-2">{eventTextFr(event.researchNote, idx?.speciesByDex, lang, moveNames)}</p>}
              {event.research.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{event.research.map((m) => renderMonTile(m, 'research'))}</div>
              )}
            </div>
          </section>
        )}

        {/* Community Day exclusive moves */}
        {event.moves.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_moves}</h3>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {event.moves.map((mv, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-line p-2 text-xs">
                  {mv.mons[0] && <img src={mv.mons[0].image} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 object-contain" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{bonusFr(mv.pokemon, idx?.speciesByDex, lang)}</div>
                    <div className="truncate text-ink-2">{moveNameLocalized(mv.move, tools.data?.moveNames, lang)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* GO Pass & GO Pass Deluxe */}
        {(event.goPass || deluxeBonuses.length > 0) && (
          <section className="rounded-2xl border border-amber-400/50 bg-shiny-soft/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold">🎫 {event.goPass?.title ? eventTitle(event.goPass.title, idx?.speciesByDex, lang) : t.events_gopass}</span>
              {event.goPass?.price && <Badge tone="shiny">{t.events_gopass_deluxe} · {event.goPass.price}</Badge>}
            </div>
            {deluxeBonuses.length > 0 && <div className="mt-2">{renderBonusList(deluxeBonuses)}</div>}
            {event.goPass && (event.goPass.freeRewards.length > 0 || event.goPass.deluxeRewards.length > 0) && (
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {event.goPass.freeRewards.length > 0 && (
                  <div className="rounded-xl bg-card/80 p-2.5">
                    <p className="mb-1 text-[11px] font-bold uppercase text-ink-3">{t.events_gopass_free}</p>
                    <ul className="space-y-0.5 text-xs text-ink-2">
                      {event.goPass.freeRewards.map((r, i) => <li key={i}>• {bonusFr(r, idx?.speciesByDex, lang)}</li>)}
                    </ul>
                  </div>
                )}
                {event.goPass.deluxeRewards.length > 0 && (
                  <div className="rounded-xl bg-card/80 p-2.5">
                    <p className="mb-1 text-[11px] font-bold uppercase text-amber-700 dark:text-amber-300">👑 {t.events_gopass_deluxe}</p>
                    <ul className="space-y-0.5 text-xs text-ink-2">
                      {event.goPass.deluxeRewards.map((r, i) => <li key={i}>• {bonusFr(r, idx?.speciesByDex, lang)}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Paid Event Ticket / Timed Research */}
        {event.ticket && (
          <section className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold">🎟️ {eventLabelFr(event.ticket.title, lang, idx?.speciesByDex, moveNames) || t.events_ticket}</span>
              {event.ticket.price && <Badge tone="shiny">{event.ticket.price}</Badge>}
            </div>
            {event.ticket.rewards.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {event.ticket.rewards.map((r, i) => (
                  <span key={i} className="rounded-lg bg-card px-2 py-1 text-xs font-bold shadow-sm">
                    {bonusFr(r, idx?.speciesByDex, lang)}
                  </span>
                ))}
              </div>
            )}
            {event.ticket.bonuses.length > 0 && (
              <div className="mt-2.5">
                <p className="mb-1 text-[11px] font-bold uppercase text-ink-3">{t.events_bonuses_ticket}</p>
                {renderBonusList(event.ticket.bonuses)}
              </div>
            )}
          </section>
        )}

        {/* Export / Share infographic as PNG image or PDF */}
        <section className="rounded-2xl border border-line bg-paper-2/50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{t.events_export_title}</p>
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" className="min-h-9 flex-1 text-xs" disabled={!!exporting} onClick={() => exportEvent('image')}>
              {exporting === 'image' ? t.events_export_working : `🖼️ ${t.events_export_image}`}
            </Button>
            <Button className="min-h-9 flex-1 text-xs" disabled={!!exporting} onClick={() => exportEvent('pdf')}>
              {exporting === 'pdf' ? t.events_export_working : `📄 ${t.events_export_pdf}`}
            </Button>
            {canCopyPicture() && (
              <Button tone="ghost" className="min-h-9 bg-card text-xs" disabled={!!exporting} onClick={() => exportEvent('copy')}>
                {exporting === 'copy' ? t.events_export_working : `📋 ${t.events_export_copy}`}
              </Button>
            )}
            {canSharePictures() && (
              <Button tone="ghost" className="min-h-9 bg-card text-xs" disabled={!!exporting} onClick={() => exportEvent('share')}>
                {exporting === 'share' ? t.events_export_working : `↗ ${t.events_export_share}`}
              </Button>
            )}
          </div>
        </section>

        {/* Optional Leek Duck graphic + MyDexPoGo shortcut & source link */}
        {event.graphicUrl && (
          <details className="rounded-xl border border-line p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-sky">{t.events_graphic_ld}</summary>
            <img src={event.graphicUrl} alt={title} loading="lazy" className="mt-2 w-full rounded-lg" />
          </details>
        )}
        {(() => {
          const inApp =
            event.eventType === 'raid-battles' || event.eventType === 'raid-hour' || event.template === 'raid_day'
              ? { to: '/game?tab=raids', label: t.events_open_raids }
              : event.template === 'max' || event.eventType === 'max-mondays' || event.eventType === 'max-battles'
                ? { to: '/game?tab=max', label: t.events_open_max }
                : event.eventType === 'go-battle-league'
                  ? { to: '/pvp', label: t.events_open_pvp }
                  : null;
          return (
            <div className="flex flex-wrap gap-2 pt-1">
              {inApp && (
                <Link to={inApp.to} onClick={onClose} className={buttonClass('primary', 'flex-1 text-sm')}>
                  {inApp.label}
                </Link>
              )}
              {event.link && (
                <a href={event.link} target="_blank" rel="noreferrer" className={buttonClass('quiet', `${inApp ? 'shrink-0' : 'flex-1'} text-sm`)}>
                  {t.open_leekduck} ↗
                </a>
              )}
              <Button tone={inApp ? 'quiet' : 'primary'} className="shrink-0 text-sm" onClick={onClose}>{t.close}</Button>
            </div>
          );
        })()}
      </div>
    </Sheet>
  );
}
