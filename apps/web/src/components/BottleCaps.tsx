import { useState } from 'react';
import { candidateSearch, HYPER_TRAINING, type HtStat } from '../lib/hyperTraining.js';
import { useLang, useT } from '../lib/i18n.js';
import { Button, Chip, CopyButton } from './ui.js';

/** Hyper Training helper: candidate search string, rules, and the task for each IV step. */
export function BottleCaps() {
  const t = useT();
  const { lang } = useLang();
  const [shinyOnly, setShinyOnly] = useState(true);
  const [stat, setStat] = useState<HtStat>('atk');
  const [current, setCurrent] = useState(0);
  const search = candidateSearch(shinyOnly);
  const tasks = HYPER_TRAINING[lang === 'fr' ? 'fr' : 'en'][stat];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.caps_intro}</p>

      <section className="card p-3">
        <h3 className="font-bold">{t.caps_candidates}</h3>
        <p className="mt-1 text-sm text-ink-2">{t.caps_candidates_hint}</p>
        <code className="mt-2 block break-all rounded-xl bg-paper-2 px-3 py-2 text-sm">{search}</code>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton tone="primary" text={search} />
          <Chip active={shinyOnly} onClick={() => setShinyOnly((v) => !v)}>{t.caps_shiny_only}</Chip>
        </div>
      </section>

      <section className="card p-3">
        <h3 className="font-bold">{t.caps_rules}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>{t.caps_rule_buddy}</li>
          <li>{t.caps_rule_shadow}</li>
          <li>{t.caps_rule_hundo}</li>
          <li>{t.caps_rule_home}</li>
        </ul>
      </section>

      <section className="card p-3">
        <h3 className="font-bold">{t.caps_tasks}</h3>
        <p className="mt-1 text-sm text-ink-2">{t.caps_tasks_hint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['atk', 'def', 'sta'] as const).map((s) => (
            <Chip key={s} active={stat === s} onClick={() => setStat(s)}>{t[`stat_${s}`]}</Chip>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-ink-2">{t.caps_current_iv}</span>
          <input type="range" min={0} max={15} value={current} onChange={(e) => setCurrent(Number(e.target.value))} className="h-8 flex-1 accent-go" />
          <span className="tnum w-7 text-right text-lg font-bold">{current}</span>
        </label>
        {current === 15 ? (
          <p className="mt-2 text-sm font-semibold text-go-ink dark:text-go">{t.caps_maxed}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-3">{t.caps_remaining(15 - current)}</p>
        )}
        <ol className="mt-3 space-y-1.5">
          {tasks.map((task, i) => {
            const target = i + 1;
            const done = target <= current;
            const next = target === current + 1;
            return (
              <li key={target} className={`flex gap-3 rounded-lg px-2 py-1.5 text-sm ${next ? 'bg-go-soft font-semibold' : ''} ${done ? 'text-ink-3 opacity-60' : ''}`}>
                <span className="tnum w-12 shrink-0 font-bold">IV {target}</span>
                <span>{task}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="text-center text-xs text-ink-3">{t.caps_source}</p>
    </div>
  );
}
