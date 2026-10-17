import { useEffect, useState, type ChangeEvent } from 'react';

type SettingsUser = {
  id: string;
  name?: string | null;
  email: string;
  role: 'OWNER' | 'WORKER';
  profilePhoto?: string | null;
  fontSize?: 'small' | 'medium' | 'large';
  highContrast?: boolean;
};

type SettingsPageProps = {
  apiBaseUrl: string;
  token: string;
  user: SettingsUser;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => Promise<void>;
  onUserChange: (user: Partial<SettingsUser>) => void;
};

type WorkerPermissionData = {
  id: string;
  name: string | null;
  email: string;
  permissions: Record<string, boolean>;
};

const fontSizeSteps = ['small', 'medium', 'large'] as const;

const permissionLabels: Record<string, string> = {
  POND_VIEW_ASSIGNED: 'View assigned ponds',
  POND_UPDATE: 'Update pond information',
  FEEDING_CREATE: 'Record feeding',
  FEEDING_VIEW_ASSIGNED: 'View feeding records',
  FEEDING_UPDATE_OWN: 'Edit own feeding records',
  WATER_QUALITY_CREATE: 'Record water quality',
  WATER_QUALITY_VIEW_ASSIGNED: 'View water quality records',
  WATER_CHANGE_CREATE: 'Record water changes',
  WATER_CHANGE_VIEW_ASSIGNED: 'View water changes',
  MORTALITY_CREATE: 'Record fish mortality',
  MORTALITY_VIEW_ASSIGNED: 'View mortality records',
  HARVEST_CREATE: 'Record harvests',
  HARVEST_VIEW_ASSIGNED: 'View harvest records',
  OBSERVATION_CREATE: 'Add observations',
  OBSERVATION_VIEW_ASSIGNED: 'View observations',
  TASK_VIEW_ASSIGNED: 'View assigned tasks',
  TASK_COMPLETE: 'Complete assigned tasks',
  TASK_COMMENT: 'Comment on tasks',
  ATTACHMENT_CREATE: 'Upload pond attachments',
  INVENTORY_VIEW: 'View workspace inventory',
  REPORT_VIEW: 'View reports',
};

export function SettingsPage({ apiBaseUrl, token, user, theme, onThemeChange, onUserChange }: SettingsPageProps) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [photo, setPhoto] = useState(user.profilePhoto || '');
  const [fontSize, setFontSize] = useState(user.fontSize || 'medium');
  const [highContrast, setHighContrast] = useState(Boolean(user.highContrast));
  const [workers, setWorkers] = useState<WorkerPermissionData[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');

  useEffect(() => {
    setName(user.name || '');
    setEmail(user.email);
    setPhoto(user.profilePhoto || '');
    setFontSize(user.fontSize || 'medium');
    setHighContrast(Boolean(user.highContrast));
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.highContrast = String(highContrast);
  }, [fontSize, highContrast]);

  useEffect(() => {
    if (user.role !== 'OWNER') return;
    let active = true;
    fetch(`${apiBaseUrl}/settings/permissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to load user permissions');
        if (!active) return;
        setPermissions(body.permissions || []);
        setWorkers(body.workers || []);
        setSelectedWorkerId((current) => current || body.workers?.[0]?.id || '');
      })
      .catch((error: unknown) => {
        if (active) setFailure(error instanceof Error ? error.message : 'Unable to load user permissions');
      });
    return () => { active = false; };
  }, [apiBaseUrl, token, user.role]);

  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);

  async function saveProfile() {
    setSaving(true);
    setMessage('');
    setFailure('');
    try {
      const response = await fetch(`${apiBaseUrl}/settings/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, profilePhoto: photo || null, fontSize, highContrast }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save your settings');
      onUserChange(body.user);
      document.documentElement.dataset.fontSize = fontSize;
      document.documentElement.dataset.highContrast = String(highContrast);
      setMessage('Your profile and display settings have been saved.');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to save your settings');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFailure('Choose an image file for your profile photo.');
      return;
    }
    if (file.size > 750_000) {
      setFailure('Choose an image smaller than 750 KB.');
      return;
    }
    setFailure('');
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setFailure('The selected image could not be read.');
    reader.readAsDataURL(file);
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    if (newPassword !== String(form.get('confirmPassword') || '')) {
      setFailure('The new passwords do not match.');
      return;
    }
    setSaving(true);
    setMessage('');
    setFailure('');
    try {
      const response = await fetch(`${apiBaseUrl}/settings/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to change password');
      formElement.reset();
      setMessage('Your password has been changed.');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to change password');
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!selectedWorker) return;
    setSaving(true);
    setMessage('');
    setFailure('');
    try {
      const response = await fetch(`${apiBaseUrl}/settings/permissions/${selectedWorker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: selectedWorker.permissions }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save permissions');
      setMessage(`Permissions saved for ${selectedWorker.name || selectedWorker.email}.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to save permissions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-page">
      <header className="settings-intro">
        <span className="settings-eyebrow">Your workspace</span>
        <h2>Settings</h2>
        <p>Manage your account, display preferences, privacy, and team access.</p>
      </header>
      {message ? <p className="settings-notice" role="status">{message}</p> : null}
      {failure ? <p className="settings-error" role="alert">{failure}</p> : null}

      <div className="settings-grid">
        <article className="settings-card settings-profile">
          <div className="settings-card-heading">
            <span className="settings-icon">01</span>
            <div><h3>Profile</h3><p>Keep your account information up to date.</p></div>
          </div>
          <div className="settings-photo-row">
            {photo ? <img className="settings-avatar" src={photo} alt="Profile" /> : <div className="settings-avatar settings-avatar-fallback">{(name || email).slice(0, 1).toUpperCase()}</div>}
            <label className="settings-upload">
              <input type="file" accept="image/*" onChange={(event) => void uploadPhoto(event)} />
              Change profile photo
            </label>
            {photo ? <button type="button" className="settings-text-button" onClick={() => setPhoto('')}>Remove</button> : null}
          </div>
          <div className="settings-form-grid">
            <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          </div>
          <button type="button" className="primary-btn" onClick={() => void saveProfile()} disabled={saving}>Save profile</button>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon">02</span>
            <div><h3>Security</h3><p>Change your password securely.</p></div>
          </div>
          <form className="settings-form-grid settings-password-form" onSubmit={(event) => void changePassword(event)}>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button type="submit" className="secondary-btn" disabled={saving}>Update password</button>
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon">03</span>
            <div><h3>Display &amp; accessibility</h3><p>Choose a comfortable way to use AquaCulture.</p></div>
          </div>
          <div className="settings-display-controls">
            <label>Theme
              <select value={theme} onChange={(event) => void onThemeChange(event.target.value as 'light' | 'dark')}>
                <option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </label>
            <label>Font size
              <input
                className="settings-font-size-slider"
                type="range"
                min="1"
                max={fontSizeSteps.length}
                step="1"
                value={fontSizeSteps.indexOf(fontSize) + 1}
                aria-label="Font size"
                aria-valuetext={fontSize}
                onChange={(event) => setFontSize(fontSizeSteps[Number(event.target.value)] || 'medium')}
              />
              <span className="settings-font-size-labels" aria-hidden="true">
                <span>Small</span><span>Medium</span><span>Large</span>
              </span>
            </label>
            <label className="settings-toggle-row">
              <span><strong>High contrast</strong><small>Increase contrast for easier reading.</small></span>
              <input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} />
            </label>
            <button type="button" className="secondary-btn" onClick={() => void saveProfile()} disabled={saving}>Save display settings</button>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon">04</span>
            <div><h3>Privacy</h3><p>Your farm information belongs to your workspace.</p></div>
          </div>
          <div className="settings-info-box">
            <strong>Private by workspace</strong>
            <p>Your farm records and team accounts are kept separate from other AquaCulture admins. Team members can only be added by their workspace admin.</p>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon">05</span>
            <div><h3>Help &amp; feedback</h3><p>Questions, ideas, or interested in collaborating?</p></div>
          </div>
          <div className="settings-contact">
            <a href="mailto:bahy1878@gmail.com?subject=AquaCulture%20feedback">Email support &amp; feedback</a>
            <a href="tel:+220833359852">+220 833359852</a>
            <a href="tel:+220866726322">+220 866726322</a>
          </div>
        </article>

        <article className="settings-card settings-permissions-card">
          <div className="settings-card-heading">
            <span className="settings-icon">06</span>
            <div>
              <h3>User permissions</h3>
              <p>{user.role === 'OWNER' ? 'Choose what each of your workers can access.' : 'Your access is managed by your workspace admin.'}</p>
            </div>
          </div>
          {user.role === 'OWNER' ? (
            workers.length ? (
              <>
                <label className="settings-worker-select">Select a worker
                  <select value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)}>
                    {workers.map((worker) => <option value={worker.id} key={worker.id}>{worker.name || worker.email}</option>)}
                  </select>
                </label>
                {selectedWorker ? (
                  <div className="settings-permission-list">
                    {permissions.map((permission) => (
                      <label className="settings-permission-row" key={permission}>
                        <span>{permissionLabels[permission] || permission.replaceAll('_', ' ').toLowerCase()}</span>
                        <input
                          type="checkbox"
                          checked={selectedWorker.permissions[permission] !== false}
                          onChange={(event) => setWorkers((current) => current.map((worker) => worker.id === selectedWorker.id
                            ? { ...worker, permissions: { ...worker.permissions, [permission]: event.target.checked } }
                            : worker))}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="primary-btn" onClick={() => void savePermissions()} disabled={saving}>Save worker permissions</button>
              </>
            ) : <p className="settings-empty">Create a worker account to manage its permissions here.</p>
          ) : <p className="settings-info-box">Contact your admin if you need access to another part of the workspace.</p>}
        </article>
      </div>
    </section>
  );
}
