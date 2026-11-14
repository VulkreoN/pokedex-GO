import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Lang } from '@mydexpogo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Sheet, TextField, TopBar } from '../components/ui.js';
import { api } from '../lib/api.js';
import { useLogout, useMe } from '../lib/auth.js';
import { useDataset } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';
import { applyTheme, getTheme, type Theme } from '../lib/theme.js';
import { fmtCode } from './FriendsPage.js';

export function MePage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const me = useMe();
  const logout = useLogout();
  const dataset = useDataset();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');

  const pick = (th: Theme) => { setTheme(th); applyTheme(th); };
  const ds = dataset.data?.ds;

  return (
    <>
      <TopBar title={t.nav_me} />
      <main className="mx-auto max-w-3xl space-y-6 px-3 pb-24">
        {me.data ? (
          <section className="rounded-card border border-line p-4">
            <div className="text-[22px] font-bold">{me.data.username}</div>
            <div className="tnum text-sm text-ink-2">{t.my_code} · {fmtCode(me.data.friendCode)}</div>
            <Button className="mt-3" onClick={async () => { await logout.mutateAsync(); navigate('/login'); }}>{t.logout}</Button>
          </section>
        ) : (
          <section className="rounded-card sky-header rounded-card p-4">
            <h2 className="text-[22px] font-bold leading-tight">{t.welcome_title}</h2>
            <p className="mt-1 text-sm opacity-80">{t.welcome_text}</p>
            <Link to="/login" className="mt-3 inline-block"><Button tone="primary">{t.login}</Button></Link>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-bold">{t.language}</h2>
          <div className="flex gap-2">
            {(['fr', 'en'] as Lang[]).map((l) => (
              <Chip key={l} active={lang === l} onClick={() => setLang(l)}>{l === 'fr' ? 'Français' : 'English'}</Chip>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">{t.theme}</h2>
          <div className="flex gap-2">
            {(['auto', 'light', 'dark'] as Theme[]).map((th) => (
              <Chip key={th} active={theme === th} onClick={() => pick(th)}>{{ auto: t.theme_auto, light: t.theme_light, dark: t.theme_dark }[th]}</Chip>
            ))}
          </div>
        </section>

        <section className="text-sm text-ink-2">
          <h2 className="mb-1 text-base font-bold text-ink">{t.data_version}</h2>
          {ds && (
            <p>
              <span className="tnum">{ds.version}</span>, {t.data_generated(new Date(ds.generatedAt).toLocaleDateString(lang))}. {ds.species.length} Pokémon, {ds.variants.length} {t.variants_count(2).split(' ')[1]}.
            </p>
          )}
          <p className="mt-1">{t.data_sources}</p>
          <p className="mt-3 text-xs text-ink-3">{t.install_hint}</p>
        </section>

        {me.data && (
          <section>
            <Button tone="danger" onClick={() => setDeleting(true)}>{t.delete_account}</Button>
          </section>
        )}
      </main>
      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t.delete_account}>
        <p className="mb-3 text-sm text-ink-2">{t.confirm_delete_account}</p>
        <TextField type="password" label={t.password} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <Button
          tone="danger"
          className="mt-3 w-full"
          disabled={!password}
          onClick={async () => {
            try {
              await api('/auth/me', { method: 'DELETE', body: { password } });
              qc.clear();
              setDeleting(false);
              navigate('/');
            } catch {
              alert(t.err_invalid_credentials);
            }
          }}
        >
          {t.delete}
        </Button>
      </Sheet>
    </>
  );
}
