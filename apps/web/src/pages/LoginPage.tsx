import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, PasswordField, TextField } from '../components/ui.js';
import { useAuthMutation } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [confirm, setConfirm] = useState('');
  // A new password is typed twice; signing in needs it once.
  const newPassword = mode !== 'login';
  const mismatch = newPassword && confirm.length > 0 && confirm !== password;
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  // How sign-ups work now: open, by invitation, or closed.
  const signup = useQuery({ queryKey: ['signup-mode'], queryFn: () => api<{ mode: 'open' | 'invite' | 'closed' }>('/auth/signup-mode'), enabled: mode === 'register' });
  const auth = useAuthMutation(mode === 'reset' ? 'login' : mode);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword && confirm !== password) {
      setError(t.password_mismatch);
      return;
    }
    try {
      if (mode === 'reset') {
        const r = await api<{ user: unknown }>('/auth/reset', { body: { username: username.trim(), code: code.trim(), password } });
        qc.setQueryData(['me'], r.user);
        qc.invalidateQueries();
      } else await auth.mutateAsync({ username: username.trim(), password, ...(mode === 'register' && invite.trim() ? { invite: invite.trim() } : {}) });
      // A new account starts with the welcome tour.
      navigate(mode === 'register' ? '/welcome' : ((location.state as { from?: string } | null)?.from ?? '/dex'), { replace: true });
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
          {mode === 'register' && signup.data?.mode === 'invite' && <TextField label={t.invite_code} value={invite} onChange={(e) => setInvite(e.target.value)} autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" required />}
          {mode === 'register' && signup.data?.mode === 'closed' && <p className="rounded-lg bg-paper-2 p-2 text-sm text-ink-2">{t.err_signups_closed}</p>}
          <PasswordField label={mode === 'reset' ? t.new_password : t.password} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
          {newPassword && (
            <>
              <PasswordField label={t.password_confirm} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} aria-invalid={mismatch} />
              {mismatch && <p className="text-sm text-berry">{t.password_mismatch}</p>}
              {password.length > 0 && password.length < 8 && <p className="text-sm text-ink-3">{t.password_too_short}</p>}
            </>
          )}
          {error && <p className="text-sm text-berry">{error}</p>}
          <Button tone="primary" type="submit" className="w-full" disabled={auth.isPending || mismatch}>{mode === 'login' ? t.login : mode === 'register' ? t.register : t.reset_submit}</Button>
        </form>
        {mode === 'login' && <p className="mt-3 text-center text-sm"><button type="button" className="text-ink-2 underline" onClick={() => { setMode('reset'); setError(null); setConfirm(''); }}>{t.forgot}</button></p>}
        <p className="mt-4 text-center text-sm text-ink-2">
          {mode === 'login' ? t.no_account : t.has_account}{' '}
          <button type="button" className="font-semibold text-sky" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setConfirm(''); }}>
            {mode === 'login' ? t.register : t.login}
          </button>
        </p>
        <p className="mt-8 text-center text-xs text-ink-3">{t.login_hint}</p>
        <p className="mt-6 text-center text-sm"><Link to="/dex" className="font-semibold text-ink-2 underline">{t.browse_without_account}</Link></p>
      </main>
    </>
  );
}
