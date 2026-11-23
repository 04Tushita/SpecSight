// All demo content lives here so the story stays consistent everywhere.

export const TASK = {
  id: '184527',
  title: 'Notification preferences revert after page refresh',
  source: 'Azure DevOps',
  repo: 'xyz-web',
  branch: 'fix/184527-notification-prefs',
  description:
    'Users turn notification types on or off and press Save, but after a refresh the old choices come back.',
};

export const SPECS = [
  { id: 1, label: 'Turn each type on or off', text: 'Each notification type can be turned on or off.' },
  { id: 2, label: 'Choices stay after a refresh', text: 'Saved choices are still there after the page is refreshed.' },
  {
    id: 3,
    label: 'Does “Email off” stop every email?',
    clarifiedLabel: 'Email off stops all but security alerts',
    text: '“Email off” stops every email.',
    clarifiedText: '“Email off” stops every email except security alerts.',
  },
  { id: 4, label: 'A failed save shows an error', text: 'If saving fails, an error is shown and the choices stay on screen.' },
  { id: 5, label: 'Signed out: asked to sign in', text: 'Signed-out users are asked to sign in instead of seeing settings.' },
];

// 14 test cases. `fails1` = broke in Run 1 with the agent's first version.
export const CASES = [
  { id: 's1a', spec: 1, name: 'Email turns on and off', rec: 'toggleEmail' },
  { id: 's1b', spec: 1, name: 'Product updates turns on and off', rec: 'toggleUpdates' },
  { id: 's1c', spec: 1, name: 'Security alerts stay on', rec: 'securityLocked' },
  { id: 's2a', spec: 2, name: 'Saved choices load when the page opens', rec: 'loadOnOpen' },
  { id: 's2b', spec: 2, name: 'Refresh with no changes keeps choices', rec: 'refreshNoChange' },
  { id: 's2c', spec: 2, name: 'Save shows “Saving…” then “Saved”', rec: 'saveStatus' },
  { id: 's2d', spec: 2, name: 'Turn on Product updates, save, refresh', rec: 'updatesRefresh', fails1: 'Off again after the refresh' },
  { id: 's3a', spec: 3, name: 'Email off stops product update emails', rec: 'emailOffUpdates' },
  { id: 's3b', spec: 3, name: 'Email off stops mention emails', rec: 'emailOffMentions' },
  { id: 's3c', spec: 3, name: 'Email off, then a new sign-in', rec: 'securityAlert', waits: true },
  { id: 's4a', spec: 4, name: 'Save while offline shows the error', rec: 'offlineSave', fails1: 'Showed “Saved”, no error' },
  { id: 's4b', spec: 4, name: 'Choices stay after a failed save', rec: 'offlineKeep' },
  { id: 's5a', spec: 5, name: 'Signed out: asked to sign in', rec: 'signedOut' },
  { id: 's5b', spec: 5, name: 'Signed out: no settings shown', rec: 'signedOutNoSettings' },
];

// Run 1 schedule: three lanes so the lens shows parallel work.
export const RUN1_LANES = [
  [['s2a', 2200], ['s2b', 1800], ['s2c', 1600], ['s2d', 3400]],
  [['s3a', 1600], ['s3b', 1400], ['s3c', 1200], ['s4a', 2600], ['s4b', 1600]],
  [['s1a', 1800], ['s1b', 1600], ['s1c', 1400], ['s5a', 1600], ['s5b', 1200]],
];
export const RUN2_LANES = [
  [['s2a', 900], ['s2b', 800], ['s2c', 800], ['s2d', 1500]],
  [['s4a', 1500], ['s4b', 1000]],
];

export const DAN_REPLY =
  'Security alerts (new sign-ins, password changes) are always sent, even with email off. Every other email stops.';

// ---------------------------------------------------------------- source files
export const CODE = {
  original: `import { useState } from 'react';
import { useSession } from '../auth/useSession';
import { SettingsForm } from './SettingsForm';
import { Banner } from '../ui/Banner';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function NotificationSettings() {
  const session = useSession();
  const [email, setEmail] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  async function handleSave() {
    setStatus('saving');
    // TODO: persist preferences
    setStatus('saved');
  }

  if (!session.user) {
    return (
      <Banner tone="info" action="Sign in">
        Sign in to manage your notification settings.
      </Banner>
    );
  }

  return (
    <section aria-labelledby="notifications-title" className="settings-page">
      <h1 id="notifications-title">Notifications</h1>
      {status === 'error' && (
        <Banner tone="error">We could not save your choices. Try again.</Banner>
      )}
      <SettingsForm
        email={email}
        onEmailChange={setEmail}
        updates={updates}
        onUpdatesChange={setUpdates}
        securityAlerts="always"
        status={status}
        onSave={handleSave}
      />
    </section>
  );
}
`,
  v1: `import { useEffect, useState } from 'react';
import { loadPreferences, savePreferences } from '../lib/preferences';
import { useSession } from '../auth/useSession';
import { SettingsForm } from './SettingsForm';
import { Banner } from '../ui/Banner';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function NotificationSettings() {
  const session = useSession();
  const [email, setEmail] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!session.user) return;
    loadPreferences(session.user.id).then((prefs) => {
      setEmail(prefs.email);
      setUpdates(prefs.updates);
    });
  }, [session.user]);

  async function handleSave() {
    setStatus('saving');
    // TODO: persist preferences
    setStatus('saved');
  }

  if (!session.user) {
    return (
      <Banner tone="info" action="Sign in">
        Sign in to manage your notification settings.
      </Banner>
    );
  }

  return (
    <section aria-labelledby="notifications-title" className="settings-page">
      <h1 id="notifications-title">Notifications</h1>
      {status === 'error' && (
        <Banner tone="error">We could not save your choices. Try again.</Banner>
      )}
      <SettingsForm
        email={email}
        onEmailChange={setEmail}
        updates={updates}
        onUpdatesChange={setUpdates}
        securityAlerts="always"
        status={status}
        onSave={handleSave}
      />
    </section>
  );
}
`,
  fixed: `import { useEffect, useState } from 'react';
import { loadPreferences, savePreferences } from '../lib/preferences';
import { useSession } from '../auth/useSession';
import { SettingsForm } from './SettingsForm';
import { Banner } from '../ui/Banner';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function NotificationSettings() {
  const session = useSession();
  const [email, setEmail] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!session.user) return;
    loadPreferences(session.user.id).then((prefs) => {
      setEmail(prefs.email);
      setUpdates(prefs.updates);
    });
  }, [session.user]);

  async function handleSave() {
    if (!session.user) return;
    setStatus('saving');
    try {
      await savePreferences(session.user.id, { email, updates });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  if (!session.user) {
    return (
      <Banner tone="info" action="Sign in">
        Sign in to manage your notification settings.
      </Banner>
    );
  }

  return (
    <section aria-labelledby="notifications-title" className="settings-page">
      <h1 id="notifications-title">Notifications</h1>
      {status === 'error' && (
        <Banner tone="error">We could not save your choices. Try again.</Banner>
      )}
      <SettingsForm
        email={email}
        onEmailChange={setEmail}
        updates={updates}
        onUpdatesChange={setUpdates}
        securityAlerts="always"
        status={status}
        onSave={handleSave}
      />
    </section>
  );
}
`,
};

export const OTHER_FILES = {
  'SettingsForm.tsx': `import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';

type Props = {
  email: boolean;
  onEmailChange: (on: boolean) => void;
  updates: boolean;
  onUpdatesChange: (on: boolean) => void;
  securityAlerts: 'always';
  status: 'idle' | 'saving' | 'saved' | 'error';
  onSave: () => void;
};

export function SettingsForm(props: Props) {
  return (
    <form
      className="settings-card"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <Toggle
        label="Email notifications"
        hint="Mentions, assignments and comments on your projects"
        checked={props.email}
        onChange={props.onEmailChange}
      />
      <Toggle
        label="Product updates"
        hint="New features and tips, about once a month"
        checked={props.updates}
        onChange={props.onUpdatesChange}
      />
      <Toggle
        label="Security alerts"
        hint="New sign-ins and password changes"
        checked={props.securityAlerts === 'always'}
        disabled
        badge="Always on"
      />
      <Button type="submit" disabled={props.status === 'saving'}>
        {props.status === 'saving' ? 'Saving…' : 'Save changes'}
      </Button>
      {props.status === 'saved' && <Toast>Changes saved</Toast>}
    </form>
  );
}
`,
  'preferences.ts': `export type Preferences = {
  email: boolean;
  updates: boolean;
};

const url = (userId: string) => \`/api/users/\${userId}/notification-preferences\`;

export async function loadPreferences(userId: string): Promise<Preferences> {
  const res = await fetch(url(userId));
  if (!res.ok) throw new Error('Could not load preferences');
  return res.json();
}

export async function savePreferences(userId: string, prefs: Preferences): Promise<void> {
  const res = await fetch(url(userId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Could not save preferences');
}
`,
  'useSession.ts': `import { useContext } from 'react';
import { SessionContext } from './SessionProvider';

export type User = { id: string; name: string };
export type Session = { user: User | null };

export function useSession(): Session {
  return useContext(SessionContext);
}
`,
};

export const lineOf = (code, needle, from = 0) => {
  const lines = code.split('\n');
  for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return -1;
};

// Lines the agent changed in v1 compared with the original (1-based, in v1).
export const AGENT_LINES_V1 = (() => {
  const c = CODE.v1;
  const a = lineOf(c, 'useEffect(() => {');
  return [1, 2, ...Array.from({ length: 7 }, (_, i) => a + i)];
})();
export const AGENT_LINES_FIX = (() => {
  const c = CODE.fixed;
  const a = lineOf(c, 'if (!session.user) return;', lineOf(c, 'async function handleSave'));
  return Array.from({ length: 8 }, (_, i) => a + i);
})();

// Lines each spec's tests run through (needles resolved against the current code).
export const SPEC_LINES = {
  1: ['onEmailChange={setEmail}', 'onUpdatesChange={setUpdates}', 'email={email}', 'updates={updates}'],
  2: ['useEffect(() => {', 'loadPreferences(session.user.id)', 'setUpdates(prefs.updates)', 'async function handleSave', "setStatus('saved')"],
  3: ['securityAlerts="always"', 'email={email}'],
  4: ['async function handleSave', "setStatus('saving')", "setStatus('saved')", "status === 'error'"],
  5: ['if (!session.user) {', '<Banner tone="info"', 'Sign in to manage'],
};

// ---------------------------------------------------------------- recordings
// Each recording is a list of steps that drive the XYZ Company sandbox app.
// app state: { role, email, updates, banner, toast, saving, offline, reload, focus, cursor:[x,y], inbox }
const base = { role: 'new', email: true, updates: false, banner: null, toast: null, saving: false, offline: false, reload: false, focus: null, inbox: null };
const S = (label, patch, cursor, extra = {}) => ({ label, app: { ...base, ...patch }, cursor, ...extra });
const C = { email: [1022, 271], updates: [1022, 345], security: [1022, 419], save: [356, 501], reload: [97, 22] };

export const RECORDINGS = {
  toggleEmail: [S('Open settings as a new user', {}, [640, 300]), S('Turn Email off', { email: false, focus: 'email' }, C.email), S('Turn Email on again', { email: true, focus: 'email' }, C.email)],
  toggleUpdates: [S('Open settings', {}, [640, 300]), S('Turn Product updates on', { updates: true, focus: 'updates' }, C.updates), S('Turn it off again', { updates: false, focus: 'updates' }, C.updates)],
  securityLocked: [S('Open settings', {}, [640, 300]), S('Try to turn Security alerts off', { focus: 'security' }, C.security), S('It stays on (always on)', { focus: 'security' }, C.security)],
  loadOnOpen: [S('Saved on the server: Product updates on', { updates: true, reload: true }, [640, 300]), S('Open settings', { updates: true }, [640, 320]), S('Product updates shows on', { updates: true, focus: 'updates' }, C.updates)],
  refreshNoChange: [S('Open settings', {}, [640, 300]), S('Refresh the page', { reload: true }, C.reload), S('Same choices', { focus: 'updates' }, C.updates)],
  saveStatus: [S('Turn Email off', { email: false, focus: 'email' }, C.email), S('Click Save changes', { email: false, saving: true }, C.save), S('Shows “Changes saved”', { email: false, toast: 'Changes saved' }, C.save)],
  updatesRefresh: {
    1: [S('Turn on Product updates', { updates: true, focus: 'updates' }, C.updates), S('Click Save changes', { updates: true, toast: 'Changes saved' }, C.save), S('Refresh the page', { updates: true, reload: true }, C.reload), S('Off again', { updates: false, focus: 'updates' }, C.updates, { broke: true })],
    2: [S('Turn on Product updates', { updates: true, focus: 'updates' }, C.updates), S('Click Save changes', { updates: true, toast: 'Changes saved' }, C.save), S('Refresh the page', { updates: true, reload: true }, C.reload), S('Still on', { updates: true, focus: 'updates' }, C.updates)],
  },
  emailOffUpdates: [S('Turn Email off and save', { email: false, toast: 'Changes saved' }, C.save), S('Send a product update', { email: false, inbox: 'none' }, [640, 300]), S('No email arrives', { email: false, inbox: 'none' }, [640, 300])],
  emailOffMentions: [S('Turn Email off and save', { email: false, toast: 'Changes saved' }, C.save), S('Someone mentions you', { email: false, inbox: 'none' }, [640, 300]), S('No email arrives', { email: false, inbox: 'none' }, [640, 300])],
  securityAlert: {
    1: [S('Turn Email off and save', { email: false, toast: 'Changes saved' }, C.save), S('Sign in from a new device', { email: false, inbox: 'security' }, [640, 300]), S('A security alert still arrives', { email: false, inbox: 'security' }, [640, 300], { wait: true })],
    2: [S('Turn Email off and save', { email: false, toast: 'Changes saved' }, C.save), S('Sign in from a new device', { email: false, inbox: 'security' }, [640, 300]), S('Only the security alert arrives', { email: false, inbox: 'security' }, [640, 300])],
  },
  offlineSave: {
    1: [S('Go offline', { offline: true }, [640, 300]), S('Turn on Product updates', { offline: true, updates: true, focus: 'updates' }, C.updates), S('Click Save changes', { offline: true, updates: true, saving: true }, C.save), S('Shows “Changes saved”, no error', { offline: true, updates: true, toast: 'Changes saved' }, C.save, { broke: true })],
    2: [S('Go offline', { offline: true }, [640, 300]), S('Turn on Product updates', { offline: true, updates: true, focus: 'updates' }, C.updates), S('Click Save changes', { offline: true, updates: true, saving: true }, C.save), S('Shows the error', { offline: true, updates: true, banner: 'error' }, C.save)],
  },
  offlineKeep: [S('Go offline, turn on Product updates', { offline: true, updates: true }, C.updates), S('Save fails', { offline: true, updates: true, banner: 'error' }, C.save), S('Choice is still on screen', { offline: true, updates: true, banner: 'error', focus: 'updates' }, C.updates)],
  signedOut: [S('Sign out', { role: 'out' }, [640, 300]), S('Open notification settings', { role: 'out' }, [640, 300]), S('Asked to sign in', { role: 'out', focus: 'signin' }, [640, 330])],
  signedOutNoSettings: [S('Sign out', { role: 'out' }, [640, 300]), S('Open notification settings', { role: 'out' }, [640, 300]), S('No settings are shown', { role: 'out' }, [640, 330])],
};

export const recSteps = (recId, run = 1) => {
  const r = RECORDINGS[recId];
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return r[run] || r[1];
};

export const STEP_MS = 1400;
export const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Example context for the clarify step (the developer can type their own).
export const CLARIFY_EXAMPLE = 'Dan confirmed: security alerts (new sign-ins, password changes) are always sent, even with email off. Every other email stops.';
