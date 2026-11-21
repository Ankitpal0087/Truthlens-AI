import { useEffect, useState } from 'react';
import Workspace from './Workspace';

// Keep API calls same-origin in development; Vite proxies /api to the backend.
// An absolute URL can still be supplied for a separately deployed frontend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// Vite proxies `/predict` during development, while built/preview frontends
// use this local default unless VITE_ML_API_URL is provided.
const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://127.0.0.1:8007';
const TOKEN_KEY = 'truthlens.accessToken';
const NEWS_ANALYSIS_UNAVAILABLE = 'The news analysis service is unavailable.';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (_error) {
    throw new Error('Unable to reach the authentication service. Make sure the backend is running and try again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = body.errors || {};
    throw error;
  }
  return body;
}

async function predictNews(text) {
  let response;
  try {
    response = await fetch(`${ML_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (_error) {
    throw new Error(NEWS_ANALYSIS_UNAVAILABLE);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 503) throw new Error(NEWS_ANALYSIS_UNAVAILABLE);
    const detail = body.detail || body.message || `News analysis failed with HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return body;
}

const initialLogin = { identifier: '', password: '' };
const initialRegister = { fullName: '', email: '', phone: '', password: '', confirmPassword: '' };

function Field({ label, name, type = 'text', value, onChange, autoComplete, placeholder }) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-2 block font-medium">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function Message({ children, error = false }) {
  if (!children) return null;
  return <p className={`rounded-lg px-3 py-2 text-sm ${error ? 'bg-rose-950/60 text-rose-300' : 'bg-emerald-950/60 text-emerald-300'}`}>{children}</p>;
}

function ResultCard({ result }) {
  const isReal = result.label === 'Real';
  return (
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Analysis result</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className={`rounded-full px-4 py-2 text-lg font-bold ${isReal ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{result.label}</span>
        {typeof result.confidence === 'number' && <span className="text-sm text-slate-400">Model confidence: {(result.confidence * 100).toFixed(1)}%</span>}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{result.confidence_note || 'This classification is a model estimate and is not a guarantee of factual accuracy.'}</p>
    </section>
  );
}

function Dashboard({ user, busy, handleLogout }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  async function handleAnalyze(event) {
    event.preventDefault();
    if (!text.trim()) { setError('Enter a headline or article before testing.'); return; }
    setAnalyzing(true); setError(''); setResult(null);
    try { setResult(await predictNews(text.trim())); }
    catch (analysisError) { setError(analysisError.message); }
    finally { setAnalyzing(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div><p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">TruthLens AI</p><p className="mt-1 text-xs text-slate-500">News testing workspace</p></div>
          <div className="flex items-center gap-4"><span className="hidden text-sm text-slate-400 sm:inline">{user.fullName}</span><button onClick={handleLogout} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-60">{busy ? 'Signing out…' : 'Log out'}</button></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:block"><p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace</p><div className="mt-4 rounded-xl bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-300">Test news</div><div className="mt-2 px-3 py-3 text-sm text-slate-500">Analysis history</div></aside>
        <section className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">News testing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Check a headline or article</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-400">Paste the news text you want to evaluate. TruthLens AI will send it to the trained classification model and show the returned prediction.</p>
          <form onSubmit={handleAnalyze} className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
            <label className="block text-sm font-medium text-slate-300" htmlFor="news-text">News headline or article</label>
            <textarea id="news-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={100000} rows={9} placeholder="Paste a headline or article here…" className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" />
            {error && <Message error>{error}</Message>}
            <div className="mt-4 flex items-center justify-between gap-4"><span className="text-xs text-slate-600">{text.length.toLocaleString()} / 100,000 characters</span><button disabled={analyzing} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{analyzing ? 'Analyzing…' : 'Test news'}</button></div>
          </form>
          {result && <ResultCard result={result} />}
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('checking');
  const [mode, setMode] = useState('login');
  const [login, setLogin] = useState(initialLogin);
  const [register, setRegister] = useState(initialRegister);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (active) setAuthState('anonymous');
        return;
      }

      try {
        const { user: currentUser } = await request('/auth/me');
        if (!active) return;
        setUser(currentUser);
        setAuthState('authenticated');
      } catch (_error) {
        localStorage.removeItem(TOKEN_KEY);
        if (!active) return;
        setUser(null);
        setAuthState('anonymous');
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify(login) });
      localStorage.setItem(TOKEN_KEY, result.token);
      setUser(result.user);
      setAuthState('authenticated');
      setLogin(initialLogin);
    } catch (submitError) {
      setError(submitError.status === 401 ? 'Email/phone or password is incorrect.' : submitError.message);
    } finally { setBusy(false); }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    if (register.password !== register.confirmPassword) {
      setBusy(false); setError('Passwords do not match.'); return;
    }
    try {
      const result = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName: register.fullName, email: register.email, phone: register.phone, password: register.password }),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setUser(result.user);
      setAuthState('authenticated');
      setRegister(initialRegister);
    } catch (submitError) {
      if (submitError.status === 409) setError('An account with that email or phone already exists.');
      else setError(Object.values(submitError.details || {})[0] || submitError.message);
    } finally { setBusy(false); }
  }

  async function handleLogout() {
    setBusy(true); setError('');
    try { await request('/auth/logout', { method: 'POST' }); } catch (_error) { /* Clear local JWT even if the server is unavailable. */ }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null); setAuthState('anonymous'); setBusy(false); setSuccess('You have been logged out.');
  }

  if (authState === 'checking') return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Checking your session…</main>;
  if (authState === 'authenticated' && user) return <Workspace user={user} onLogout={handleLogout} />;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100 sm:px-6 sm:py-16">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="grid md:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden bg-gradient-to-br from-cyan-950 via-slate-900 to-slate-950 p-10 md:block">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">TruthLens AI</p>
            <h1 className="mt-10 text-5xl font-bold tracking-tight">A clearer lens on news.</h1>
            <p className="mt-6 max-w-md leading-7 text-slate-300">Sign in to keep your fact-checking workspace secure and ready wherever you return.</p>
          </div>
          <div className="p-6 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400 md:hidden">TruthLens AI</p>
            <>
                <div className="mt-5 flex gap-6 border-b border-slate-800">
                  <button className={`border-b-2 pb-3 font-semibold ${mode === 'login' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-500'}`} onClick={() => switchMode('login')}>Log in</button>
                  <button className={`border-b-2 pb-3 font-semibold ${mode === 'register' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-500'}`} onClick={() => switchMode('register')}>Create account</button>
                </div>
                <h2 className="mt-8 text-3xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
                <p className="mt-2 text-slate-400">{mode === 'login' ? 'Use your email or phone to continue.' : 'Join TruthLens AI in a few seconds.'}</p>
                <form className="mt-7 space-y-4" onSubmit={mode === 'login' ? handleLogin : handleRegister}>
                  {mode === 'login' ? <><Field label="Email or phone" name="identifier" value={login.identifier} onChange={(e) => setLogin({ ...login, identifier: e.target.value })} autoComplete="username" placeholder="you@example.com" /><Field label="Password" name="password" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} autoComplete="current-password" placeholder="Your password" /></> : <><Field label="Full name" name="fullName" value={register.fullName} onChange={(e) => setRegister({ ...register, fullName: e.target.value })} autoComplete="name" placeholder="Your name" /><Field label="Email" name="email" type="email" value={register.email} onChange={(e) => setRegister({ ...register, email: e.target.value })} autoComplete="email" placeholder="you@example.com" /><Field label="Phone" name="phone" type="tel" value={register.phone} onChange={(e) => setRegister({ ...register, phone: e.target.value })} autoComplete="tel" placeholder="+1 555 123 4567" /><Field label="Password" name="password" type="password" value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} autoComplete="new-password" placeholder="8+ chars, upper/lowercase and number" /><Field label="Confirm password" name="confirmPassword" type="password" value={register.confirmPassword} onChange={(e) => setRegister({ ...register, confirmPassword: e.target.value })} autoComplete="new-password" placeholder="Repeat your password" /></>}
                  <Message error={Boolean(error)}>{error}</Message><Message>{success}</Message>
                  <button className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
                </form>
                <p className="mt-6 text-center text-sm text-slate-500">{mode === 'login' ? <>Need an account? <button className="font-semibold text-cyan-300 hover:text-cyan-200" onClick={() => switchMode('register')}>Create one</button></> : <>Already registered? <button className="font-semibold text-cyan-300 hover:text-cyan-200" onClick={() => switchMode('login')}>Log in</button></>}</p>
            </>
          </div>
        </div>
      </section>
    </main>
  );
}

