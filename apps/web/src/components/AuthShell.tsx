import React, { useState } from 'react';

interface AuthProps {
  apiBaseUrl: string;
  onLoginSuccess: (token: string, user: any) => void;
}

export function AuthShell({ apiBaseUrl, onLoginSuccess }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regCode, setRegCode] = useState('OWNER2024');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) {
        throw new Error(body.error || 'Login failed');
      }

      localStorage.setItem('aquaculture-token', body.token);
      localStorage.setItem('aquaculture-user', JSON.stringify(body.user));
      onLoginSuccess(body.token, body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!regName || !regEmail || !regPassword || !regCode) {
      setError('Name, email, password, and admin code are required');
      setLoading(false);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          code: regCode,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) {
        throw new Error(body.error || 'Admin registration failed');
      }

      localStorage.setItem('aquaculture-token', body.token);
      localStorage.setItem('aquaculture-user', JSON.stringify(body.user));
      onLoginSuccess(body.token, body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark">AS</span>
          <div>
            <p className="eyebrow">Smart Aquaculture. Smarter Decisions.</p>
            <h1>AquaCulture</h1>
          </div>
        </div>
        <p className="auth-copy">Only the farm admin can sign in with a special code. Workers are created by the admin.</p>

        {isRegistering ? (
          <form className="auth-form" onSubmit={handleRegister}>
            <h2>Create admin account</h2>
            <label>Full Name<input value={regName} type="text" onChange={(e) => setRegName(e.target.value)} required /></label>
            <label>Email<input value={regEmail} type="email" onChange={(e) => setRegEmail(e.target.value)} required /></label>
            <label>Password<input value={regPassword} type="password" onChange={(e) => setRegPassword(e.target.value)} required /></label>
            <label>Confirm Password<input value={regConfirmPassword} type="password" onChange={(e) => setRegConfirmPassword(e.target.value)} required /></label>
            <label>Admin code<input value={regCode} type="text" onChange={(e) => setRegCode(e.target.value.toUpperCase())} placeholder="OWNER2024" required /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-btn" type="submit" disabled={loading}> {loading ? 'Creating account...' : 'Register admin'} </button>
            <p style={{ marginTop: 12, textAlign: 'center' }}>
              <button type="button" className="text-link" onClick={() => { setIsRegistering(false); setError(''); }}>
                Back to login
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>Email<input value={loginEmail} type="email" onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input value={loginPassword} type="password" onChange={(e) => setLoginPassword(e.target.value)} placeholder="Enter password" /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
            <p style={{ marginTop: 12, textAlign: 'center' }}>
              <button type="button" className="text-link" onClick={() => { setIsRegistering(true); setError(''); }}>
                Register as admin
              </button>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}

