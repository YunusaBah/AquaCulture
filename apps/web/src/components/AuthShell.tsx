import React, { useState } from 'react';

interface AuthProps {
  apiBaseUrl: string;
  onLoginSuccess: (token: string, user: any) => void;
}

type AuthView = 'home' | 'login' | 'register';

export function AuthShell({ apiBaseUrl, onLoginSuccess }: AuthProps) {
  const [view, setView] = useState<AuthView>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    if (view === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/${view === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(view === 'register' ? { name, email, password } : { email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) throw new Error(body.error || 'Unable to continue');

      localStorage.setItem('aquaculture-token', body.token);
      localStorage.setItem('aquaculture-user', JSON.stringify(body.user));
      onLoginSuccess(body.token, body.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to continue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-landing">
      <section className={`auth-hero${view !== 'home' ? ' auth-hero-auth' : ''}`}>
        <div className="auth-hero-image" aria-hidden="true" />
        <header className="auth-topbar">
          <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); setView('home'); }}>
            <span className="auth-brand-mark">A</span>
            <span>AquaCulture</span>
          </a>
          <span className="auth-topbar-note">Aquaculture management, made clear</span>
        </header>

        <div className="auth-hero-content">
          <div className="auth-hero-copy">
            {view === 'home' ? (
              <>
                <span className="auth-kicker">Grow with confidence</span>
                <h1>Better fish farming starts with better insight.</h1>
                <p>Bring pond health, feeding, stock, tasks, people, and farm performance together in one calm, practical workspace.</p>
                <div className="auth-home-actions">
                  <button type="button" className="auth-primary" onClick={() => { setError(''); setView('login'); }}>Log in</button>
                  <button type="button" className="auth-secondary" onClick={() => { setError(''); setView('register'); }}>Create an admin account</button>
                </div>
                <div className="auth-hero-note">
                  <span className="auth-live-dot" />
                  One private workspace for every farm team
                </div>
              </>
            ) : (
              <form className="auth-form auth-form-card" onSubmit={submit}>
                <button type="button" className="auth-back-link" onClick={() => { setError(''); setView('home'); }}>← Back to AquaCulture</button>
                <h2>{view === 'register' ? 'Create your admin account' : 'Welcome back'}</h2>
                <p>{view === 'register' ? 'Start a private workspace for your farm and team.' : 'Sign in to continue to your farm workspace.'}</p>
                {view === 'register' ? (
                  <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
                ) : null}
                <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label>Password<input type="password" autoComplete={view === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                {view === 'register' ? (
                  <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
                ) : null}
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <button className="auth-primary auth-submit" type="submit" disabled={loading}>
                  {loading ? 'Please wait…' : view === 'register' ? 'Create account' : 'Log in'}
                </button>
                <p className="auth-switch">
                  {view === 'register' ? 'Already have an account?' : 'New to AquaCulture?'}
                  <button type="button" onClick={() => { setError(''); setView(view === 'register' ? 'login' : 'register'); }}>
                    {view === 'register' ? 'Log in' : 'Register'}
                  </button>
                </p>
              </form>
            )}
          </div>

          <aside className="auth-about">
            <div className="auth-about-inner">
              <span className="auth-kicker">About the platform</span>
              <h2>Built for the work happening at the water’s edge.</h2>
              <p>AquaCulture helps aquaculture teams keep day-to-day farm records organized—from pond and fish-stock monitoring to worker inputs, feeding, water quality, harvests, tasks, and reporting. Each admin workspace keeps its farm data and team records separate.</p>
              <img
                className="auth-about-fish"
                src="https://images.unsplash.com/photo-1541441056316-443fff347c40?auto=format&fit=crop&w=1000&q=80"
                alt="Fish swimming in a clear aquaculture pond"
              />
            </div>
          </aside>
        </div>
        <a className="auth-photo-credit" href="https://unsplash.com/s/photos/ghana-tilapia-farming-pond" target="_blank" rel="noreferrer">Pond harvest · Photos via Unsplash</a>
      </section>

      <footer className="auth-footer">
        <div className="auth-footer-inner">
          <div className="auth-footer-copy">
            <h2>Collaborators &amp; sponsors welcome</h2>
            <p>We welcome collaborators and sponsors who want to support responsible aquaculture. Get in touch by phone or email to discuss opportunities.</p>
          </div>
          <div className="auth-contact-list" aria-label="Contact details">
            <a href="tel:+220833359852">+220 833359852</a>
            <a href="tel:+220866726322">+220 866726322</a>
            <a href="mailto:bahy1878@gmail.com">bahy1878@gmail.com</a>
          </div>
          <small>© {new Date().getFullYear()} AquaCulture · Farm data stays within its workspace</small>
        </div>
      </footer>
    </main>
  );
}
