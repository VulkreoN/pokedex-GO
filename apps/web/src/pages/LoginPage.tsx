import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, TextField } from '../components/ui.js';
import { useAuthMutation } from '../lib/auth.js';
import { useT } from '../lib/i18n.js';
import { errorMessage } from './FriendsPage.js';

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const auth = useAuthMutation(mode);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await auth.mutateAsync({ username: username.trim(), password });
      navigate((location.state as { from?: string } | null)?.from ?? '/dex', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
    }
  };

  return (
    <>
      <main className="mx-auto max-w-sm px-4 pb-24 pt-16">
        <h2 className="text-[28px] font-bold leading-tight">{t.welcome_title}</h2>
        <p className="mb-6 mt-2 text-[15px] text-[var(--ink-2)]">{t.welcome_text}</p>
        <form onSubmit={submit} className="space-y-3">
          <TextField label={t.username} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={20} />
          <TextField label={t.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
          {error && <p className="text-sm text-berry">{error}</p>}
          <Button tone="primary" type="submit" className="w-full" disabled={auth.isPending}>{mode === 'login' ? t.login : t.register}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--ink-2)]">
          {mode === 'login' ? t.no_account : t.has_account}{' '}
          <button type="button" className="font-semibold text-sky" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? t.register : t.login}
          </button>
        </p>
        <p className="mt-8 text-center text-xs text-[var(--ink-3)]">{t.login_hint}</p>
        <p className="mt-6 text-center text-sm"><Link to="/dex" className="font-semibold text-[var(--ink-2)] underline">{t.browse_without_account}</Link></p>
      </main>
    </>
  );
}
