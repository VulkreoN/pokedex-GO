import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, TextField } from '../components/ui.js';
import { useAuthMutation } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../lib/i18n.js';
import { errorMessage } from './FriendsPage.js';

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [code, setCode] = useState('');
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const auth = useAuthMutation(mode === 'reset' ? 'login' : mode);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'reset') {
        const r = await api<{ user: unknown }>('/auth/reset', { body: { username: username.trim(), code: code.trim(), password } });
        qc.setQueryData(['me'], r.user);
        qc.invalidateQueries();
      } else await auth.mutateAsync({ username: username.trim(), password });
      navigate((location.state as { from?: string } | null)?.from ?? '/dex', { replace: true });
    } catch (err) {
      setError(mode === 'reset' ? t.err_invalid_code_reset : errorMessage(t, err));
    }
  };

  return (
    <>
      <main className="mx-auto max-w-sm px-4 pb-24 pt-16">
        <h2 className="text-[28px] font-bold leading-tight">{mode === 'reset' ? t.reset_title : t.welcome_title}</h2>
        <p className="mb-6 mt-2 text-[15px] text-ink-2">{mode === 'reset' ? t.reset_hint : t.welcome_text}</p>
        <form onSubmit={submit} className="space-y-3">
          <TextField label={t.username} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={20} />
          {mode === 'reset' && <TextField label={t.reset_code} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" required />}
          <TextField label={mode === 'reset' ? t.new_password : t.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
          {error && <p className="text-sm text-berry">{error}</p>}
          <Button tone="primary" type="submit" className="w-full" disabled={auth.isPending}>{mode === 'login' ? t.login : mode === 'register' ? t.register : t.reset_submit}</Button>
        </form>
        {mode === 'login' && <p className="mt-3 text-center text-sm"><button type="button" className="text-ink-2 underline" onClick={() => { setMode('reset'); setError(null); }}>{t.forgot}</button></p>}
        <p className="mt-4 text-center text-sm text-ink-2">
          {mode === 'login' ? t.no_account : t.has_account}{' '}
          <button type="button" className="font-semibold text-sky" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? t.register : t.login}
          </button>
        </p>
        <p className="mt-8 text-center text-xs text-ink-3">{t.login_hint}</p>
        <p className="mt-6 text-center text-sm"><Link to="/dex" className="font-semibold text-ink-2 underline">{t.browse_without_account}</Link></p>
      </main>
    </>
  );
}
