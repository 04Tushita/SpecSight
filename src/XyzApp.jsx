// The XYZ Company app, the product the developer is fixing. Rendered at 1280x800 and
// scaled down for thumbnails, recordings and the sandbox.
export const FW = 1280;
export const FH = 800;

function Toggle({ on, disabled, onClick, focus, live }) {
  const T = live ? 'button' : 'span';
  return (
    <T type={live ? 'button' : undefined} className={`fn-toggle ${on ? 'on' : ''} ${disabled ? 'dis' : ''} ${focus ? 'focus' : ''}`} onClick={disabled || !live ? undefined : onClick} aria-pressed={live ? on : undefined}>
      <span />
    </T>
  );
}

export default function XyzApp({ app, scale = 1, onToggle, onSave, onRefresh, interactive = false, cursor = null, caption = null, className = '' }) {
  const a = app;
  const out = a.role === 'out';
  const B = interactive ? 'button' : 'span';
  return (
    <div className={`fn-wrap ${className}`} style={{ width: FW * scale, height: FH * scale }}>
      <div className={`fn ${interactive ? 'fn-live' : ''}`} style={{ transform: `scale(${scale})` }}>
        <div className="fn-chrome">
          <span className="tl r" />
          <span className="tl y" />
          <span className="tl g" />
          <B type={interactive ? 'button' : undefined} className={`fn-reload ${a.reload ? 'spin' : ''}`} onClick={interactive ? onRefresh : undefined} title="Refresh">
            ↻
          </B>
          <div className="fn-url">app.xyzcompany.com/settings/notifications</div>
          {a.offline && <span className="fn-offline">Offline</span>}
          {a.network === 'slow' && !a.offline && <span className="fn-offline slow">Slow 3G</span>}
        </div>
        <div className="fn-top">
          <span className="fn-logo">X</span>
          <b>XYZ Company</b>
          <span className="fn-ws">Design team ▾</span>
          <span className="fn-search">Search</span>
          <span className="fn-bell" />
          <span className="fn-avatar">{out ? '' : a.role === 'admin' ? 'M' : 'A'}</span>
        </div>
        <div className="fn-body">
          <aside className="fn-side">
            <div className="fn-side-h">SETTINGS</div>
            {['Profile', 'Account', 'Notifications', 'Security', 'Integrations', 'Billing'].map((x) => (
              <div key={x} className={`fn-nav ${x === 'Notifications' ? 'on' : ''}`}>
                {x}
              </div>
            ))}
          </aside>
          <main className="fn-main">
            {out ? (
              <div className={`fn-signin ${a.focus === 'signin' ? 'focus' : ''}`}>
                <div className="fn-signin-i">i</div>
                <div>
                  <b>Sign in to manage your notification settings.</b>
                  <div className="fn-signin-sub">Your choices are saved to your account.</div>
                </div>
                <span className="fn-btn">Sign in</span>
              </div>
            ) : (
              <>
                <h1>Notifications</h1>
                <p className="fn-sub">Choose what XYZ Company emails you about.</p>
                {a.banner === 'error' && <div className="fn-error">We could not save your choices. Try again.</div>}
                <div className="fn-card">
                  <div className={`fn-row ${a.focus === 'email' ? 'focus' : ''}`}>
                    <div>
                      <b>Email notifications</b>
                      <span>Mentions, assignments and comments on your projects</span>
                    </div>
                    <Toggle on={a.email} onClick={() => onToggle && onToggle('email')} focus={a.focus === 'email'} live={interactive} />
                  </div>
                  <div className={`fn-row ${a.focus === 'updates' ? 'focus' : ''}`}>
                    <div>
                      <b>Product updates</b>
                      <span>New features and tips, about once a month</span>
                    </div>
                    <Toggle on={a.updates} onClick={() => onToggle && onToggle('updates')} focus={a.focus === 'updates'} live={interactive} />
                  </div>
                  <div className={`fn-row ${a.focus === 'security' ? 'focus' : ''}`}>
                    <div>
                      <b>Security alerts</b>
                      <span>New sign-ins and password changes</span>
                    </div>
                    <span className="fn-always">Always on</span>
                    <Toggle on disabled focus={a.focus === 'security'} />
                  </div>
                </div>
                <B type={interactive ? 'button' : undefined} className={`fn-save ${a.saving ? 'saving' : ''}`} onClick={interactive ? onSave : undefined} disabled={interactive ? a.saving : undefined}>
                  {a.saving ? 'Saving…' : 'Save changes'}
                </B>
              </>
            )}
            {a.inbox && (
              <div className="fn-inbox">
                <div className="fn-inbox-h">Inbox · {a.role === 'out' ? '' : 'alex@xyzcompany.com'}</div>
                {a.inbox === 'none' ? (
                  <div className="fn-mail empty">No new email</div>
                ) : (
                  <div className="fn-mail">
                    <b>Security alert: new sign-in</b>
                    <span>A new device signed in to your XYZ Company account.</span>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
        {a.toast && (
          <div className="fn-toast" key={a.toast + String(a.toastKey || '')}>
            ✓ {a.toast}
          </div>
        )}
        {a.reload && <div className="fn-reloading" />}
        {cursor && (
          <svg className="fn-cursor" style={{ left: cursor[0], top: cursor[1] }} width="30" height="40" viewBox="0 0 15 20">
            <path d="M1 1 L1 15.5 L4.6 12.2 L7.2 18.2 L9.6 17.2 L7 11.3 L12 11.3 Z" fill="#fff" stroke="#111" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        )}
        {caption && <div className={`fn-caption ${caption.tone || ''}`}>{caption.text}</div>}
      </div>
    </div>
  );
}
