import { Button, TopBar } from '../components/ui.js';
import { setXEmbeds, useXEmbeds } from '../components/XEmbed.js';
import { relativeTime, useDataStatus } from '../lib/admin.js';
import { useDataset } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';

const DISCORD = 'https://discord.gg/9P6XF7SPge';
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const BUILT = import.meta.env.VITE_BUILD_DATE as string | undefined;

/** Who made the app, where to talk about it, which version runs, and where its data comes from. */
export function AboutPage() {
  const t = useT();
  const { lang } = useLang();
  const status = useDataStatus();
  const dataset = useDataset();
  const ds = dataset.data?.ds;
  const xOn = useXEmbeds();
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <TopBar title={t.about_title} back />
      <main className="mx-auto max-w-3xl space-y-4 px-3 pb-24">
        <section className="sky-header rounded-card p-5">
          <img src="/icons/icon.svg" alt="" width={56} height={56} className="rounded-2xl shadow-card" />
          <h2 className="mt-3 text-[26px] font-bold leading-tight">MyDexPoGo</h2>
          <p className="mt-1 text-sm opacity-80">{t.about_pitch}</p>
          <p className="mt-3 text-sm">
            {t.about_made_by} <strong>Hakim</strong> <span className="opacity-70">(VulkreoN)</span>
          </p>
        </section>

        <a href={DISCORD} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-card bg-[#5865F2] p-4 text-white shadow-card transition hover:brightness-110 active:scale-[0.99]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
            <path d="M19.3 5.3A16.6 16.6 0 0 0 15.2 4l-.5 1a15.4 15.4 0 0 0-5.4 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C2.1 9.2 1.4 13 1.7 16.7a16.7 16.7 0 0 0 5 2.6l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.6c.4-4.3-.7-8-3-11.4ZM8.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{t.about_discord}</span>
            <span className="block text-sm opacity-90">{t.about_discord_hint}</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
        </a>

        <section className="card p-4 text-sm">
          <h2 className="mb-2 text-base font-bold">{t.about_version_title}</h2>
          <dl className="space-y-1 text-ink-2">
            <div className="flex justify-between gap-3"><dt>{t.about_version}</dt><dd className="tnum font-semibold text-ink">{VERSION === 'dev' ? 'dev' : VERSION.slice(0, 7)}</dd></div>
            {BUILT && <div className="flex justify-between gap-3"><dt>{t.about_built}</dt><dd className="tnum text-right font-semibold text-ink">{date(BUILT)}</dd></div>}
            {ds && (
              <div className="flex justify-between gap-3">
                <dt>{t.about_dataset}</dt>
                <dd className="tnum text-right font-semibold text-ink">
                  {t.about_counts(ds.species.length, ds.variants.length)}
                  <span className="block break-all text-xs font-normal text-ink-3">v{ds.version}</span>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="card p-4 text-sm text-ink-2">
          <h2 className="mb-2 text-base font-bold text-ink">{t.data_status}</h2>
          {status.data && (
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt>{t.data_generated_at}</dt><dd className="tnum text-right font-semibold text-ink">{relativeTime(status.data.generatedAt, lang)}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t.data_next}</dt><dd className="tnum font-semibold text-ink">{status.data.running ? t.data_running : relativeTime(status.data.nextRunAt, lang)}</dd></div>
              {status.data.lastError && <div className="rounded-lg bg-berry/10 p-2 text-xs text-berry">{t.data_error} : {status.data.lastError}</div>}
            </dl>
          )}
          {status.data?.sources.length ? (
            <>
              <h3 className="mb-1 mt-3 text-xs font-semibold text-ink-3">{t.data_sources_title}</h3>
              <ul className="space-y-1">
                {status.data.sources.map((s) => (
                  <li key={s.name} className="flex justify-between gap-3"><a href={s.url} target="_blank" rel="noreferrer" className="truncate">{s.label}</a><span className="tnum shrink-0 font-semibold text-ink">{relativeTime(s.updatedAt, lang)}</span></li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="card p-4 text-sm text-ink-2">
          <h2 className="mb-2 text-base font-bold text-ink">{t.about_thanks_title}</h2>
          <p>{t.about_thanks}</p>
        </section>

        <section className="card p-4 text-sm text-ink-2" aria-labelledby="privacy">
          <h2 id="privacy" className="mb-2 text-base font-bold text-ink">{t.privacy_title}</h2>
          <p>{t.privacy_intro}</p>
          {t.privacy_items.map(([title, text]) => (
            <div key={title} className="mt-3">
              <h3 className="font-semibold text-ink">{title}</h3>
              <p>{text}</p>
            </div>
          ))}
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-paper-2 p-2">
            <span className="min-w-0 flex-1 text-xs">{xOn ? t.privacy_x_on : t.privacy_x_off}</span>
            {xOn && <Button tone="ghost" className="min-h-8 shrink-0 px-3 text-xs" onClick={() => setXEmbeds(false)}>{t.privacy_x_withdraw}</Button>}
          </div>
        </section>

        <p className="px-1 text-xs leading-relaxed text-ink-3">{t.about_legal}</p>
      </main>
    </>
  );
}
