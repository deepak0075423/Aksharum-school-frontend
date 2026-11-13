/**
 * Super Admin → Video Library → Providers.
 *
 * Where videos are stored and streamed from, and the playback rules every
 * school shares. Credentials typed here are sealed on the server and never
 * shown again — the screen only says whether one is set. A value set in the
 * server's environment wins over one saved here, and is shown as such.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Alert } from '../../../components/ui/index';
import { Head, Panel, Loadable, Icon, dayTime, errText } from '../vlParts';

const SETTING_WORDS = {
  completionThresholdPercent: ['Completion threshold (%)', 'A video counts as completed once the student has genuinely watched this much of it.'],
  heartbeatSeconds: ['Heartbeat interval (seconds)', 'How often a playing video reports to the server.'],
  sessionIdleSeconds: ['Idle session timeout (seconds)', 'A viewing session with no report for this long is closed, and its playback address with it.'],
  playbackUrlSeconds: ['Signed address life (seconds)', 'The shortest life of a signed CDN address for one video file.'],
  maxUploadMb: ['Largest upload (MB)', 'Video files above this size are refused.'],
  heartbeatRetentionDays: ['Keep raw heartbeats for (days)', 'Older raw reports are removed. The totals they produced are kept for good.'],
};

function ProviderCard({ p, onSaved }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState({});
  const [secrets, setSecrets] = useState({});
  const [clear, setClear] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  useEffect(() => {
    setSettings(Object.fromEntries(p.settingsFields.map((f) => [f.key, f.value])));
    setSecrets({}); setClear([]);
  }, [p]);

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      await api.saveProvider(p.provider, { settings, secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim())), clearSecrets: clear, ...extra });
      toast.success(`${p.label} saved`); onSaved();
    } catch (e) { toast.error(errText(e)); }
    finally { setSaving(false); }
  };
  const runCheck = async () => {
    setChecking(true);
    try { const r = (await api.checkProvider(p.provider)).data; setCheck(r); onSaved(); } catch (e) { setCheck({ ok: false, message: errText(e) }); }
    finally { setChecking(false); }
  };
  const dot = !p.enabled ? '' : p.configured ? (p.lastCheckOk === false ? 'bad' : 'ok') : 'warn';
  const editable = p.settingsFields.length || p.secretFields.length;

  return (
    <div className="vl-provider">
      <div className="vl-provider__head">
        <span className={`vl-dot${dot ? ` vl-dot--${dot}` : ''}`} />
        <div className="vl-grow">
          <b>{p.label}</b> {p.isDefault ? <span className="badge badge-primary">Takes uploads</span> : null}
          <div className="vl-small vl-muted">
            {!p.enabled ? 'Switched off' : p.configured ? 'Set up' : `Not set up — missing: ${p.missing.join(', ')}`}
            {p.lastCheckedAt ? ` · last checked ${dayTime(p.lastCheckedAt)}: ${p.lastCheckOk ? 'working' : 'failed'}` : ''}
          </div>
        </div>
        <label className={`vl-check${p.enabled ? ' is-on' : ''}`}>
          <input type="checkbox" checked={p.enabled} disabled={saving || (p.isDefault && p.enabled)} onChange={(e) => save({ enabled: e.target.checked })}
            title={p.isDefault ? 'Choose another provider for uploads before switching this one off' : undefined} /> On
        </label>
        {p.kind === 'file' && !p.isDefault ? <Button size="sm" variant="secondary" disabled={!p.usable || saving} onClick={() => save({ isDefault: true })}
          title={!p.usable ? 'Switch it on and finish its set-up first' : undefined}>Use for uploads</Button> : null}
        <Button size="sm" variant="secondary" loading={checking} onClick={runCheck}><Icon name="activity" size={14} /> Check</Button>
        {editable ? <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Set up'}</Button> : null}
      </div>
      {check ? <div style={{ padding: '0 18px 14px' }}><Alert variant={check.ok ? 'success' : 'danger'}>{check.message}</Alert></div> : null}
      {p.notes.length ? <div style={{ padding: '0 18px 14px' }} className="vl-small vl-muted">{p.notes.join(' ')}</div> : null}
      {open ? (
        <div className="vl-provider__body">
          <div className="vl-form-grid">
            {p.settingsFields.map((f) => (
              <div className="form-group" key={f.key}>
                {f.type === 'boolean' ? (
                  <label className={`vl-check${settings[f.key] ? ' is-on' : ''}`} style={{ marginTop: 22 }}>
                    <input type="checkbox" checked={!!settings[f.key]} disabled={f.fromEnv} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.checked })} /> {f.label}
                  </label>
                ) : (
                  <>
                    <label className={`form-label${f.required ? ' required' : ''}`} htmlFor={`pv-${p.provider}-${f.key}`}>{f.label}</label>
                    <input id={`pv-${p.provider}-${f.key}`} className="form-control" value={settings[f.key] ?? ''} placeholder={f.placeholder} disabled={f.fromEnv}
                      onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} autoComplete="off" />
                  </>
                )}
                {f.fromEnv ? <div className="form-hint">Set in the server's environment.</div> : f.help ? <div className="form-hint">{f.help}</div> : null}
              </div>
            ))}
            {p.secretFields.map((f) => (
              <div className={`form-group${f.multiline ? ' vl-span' : ''}`} key={f.key}>
                <label className={`form-label${f.required ? ' required' : ''}`} htmlFor={`pv-${p.provider}-${f.key}`}>{f.label}</label>
                {f.fromEnv ? <div className="form-hint">Set in the server's environment.</div> : (
                  <>
                    {f.multiline
                      ? <textarea id={`pv-${p.provider}-${f.key}`} className="form-control" rows={4} value={secrets[f.key] || ''} autoComplete="off" spellCheck={false}
                        placeholder={f.isSet ? 'Saved — paste a new key to replace it' : '-----BEGIN RSA PRIVATE KEY-----'} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />
                      : <input id={`pv-${p.provider}-${f.key}`} type="password" className="form-control" value={secrets[f.key] || ''} autoComplete="new-password"
                        placeholder={f.isSet ? 'Saved — type a new one to replace it' : ''} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />}
                    <div className="form-hint vl-row">
                      {f.isSet && !clear.includes(f.key) ? <><span>Saved, and never shown again.</span><button type="button" className="vl-link" onClick={() => setClear([...clear, f.key])}>Remove it</button></> : null}
                      {clear.includes(f.key) ? <><span>Will be removed when you save.</span><button type="button" className="vl-link" onClick={() => setClear(clear.filter((k) => k !== f.key))}>Keep it</button></> : null}
                      {!f.isSet && f.help ? <span>{f.help}</span> : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="vl-row"><Button onClick={() => save()} loading={saving}>Save {p.label}</Button><span className="vl-small vl-muted">Then use Check to confirm it works.</span></div>
        </div>
      ) : null}
    </div>
  );
}

export default function CentralVideoProviders() {
  const { data, loading, error, refetch } = useFetch(api.providers);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setForm({ ...data.settings }); }, [data]);

  const saveSettings = async () => {
    for (const [k, [min, max]] of Object.entries(data.limits)) {
      const n = Number(form[k]);
      if (!Number.isInteger(n) || n < min || n > max) return toast.error(`${SETTING_WORDS[k]?.[0] || k} must be a whole number from ${min} to ${max}`);
    }
    setSaving(true);
    try { await api.saveSettings(Object.fromEntries(Object.keys(data.limits).map((k) => [k, Number(form[k])]))); toast.success('Settings saved'); refetch(); }
    catch (e) { toast.error(errText(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="page vl-page">
      <Head title="Providers and playback" subtitle="Where videos are stored and streamed from, and the rules every school's players follow." />
      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {data ? (
          <>
            <Alert variant="info">
              Protected videos are only ever played through short-lived signed addresses tied to a viewing session; the stored files are never public.
              No website can stop a screen being recorded — for the strongest protection use DRM through a licensed player (see the deployment notes).
            </Alert>
            <div className="vl-stack">{data.providers.map((p) => <ProviderCard key={p.provider} p={p} onSaved={refetch} />)}</div>
            {form ? (
              <Panel title="Playback and tracking" subtitle="Applies to every school">
                <div className="vl-form-grid">
                  {Object.keys(data.limits).map((k) => (
                    <div className="form-group" key={k}>
                      <label className="form-label" htmlFor={`ps-${k}`}>{SETTING_WORDS[k]?.[0] || k}</label>
                      <input id={`ps-${k}`} type="number" className="form-control" min={data.limits[k][0]} max={data.limits[k][1]} step="1" value={form[k]}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                      <div className="form-hint">{SETTING_WORDS[k]?.[1]} ({data.limits[k][0]}–{data.limits[k][1]})</div>
                    </div>
                  ))}
                </div>
                <Button onClick={saveSettings} loading={saving}>Save settings</Button>
              </Panel>
            ) : null}
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
