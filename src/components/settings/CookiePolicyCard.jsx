/**
 * School Settings → Privacy & cookies (Oct 2026).
 *
 * The school admin's control over the school's cookie policy: whether the
 * admission portal shows a consent banner and what it says, which optional
 * categories exist (and the analytics or advertising IDs behind them), what is
 * stored and why, the policy's own words, and the log of answers.
 *
 * Saved from its own button, like the gateway — it is its own record. The
 * server checks everything again; it also decides when a change is big enough
 * that visitors must be asked again (a new version).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getCookiePolicy, saveCookiePolicy, resetCookiePolicy, getCookieConsents, cookieConsentsCsvUrl,
} from '../../api/privacy.api';
import { openProtected } from '../../api/admission.api';
import { Panel } from '../../pages/admin/settingsParts';
import { Spinner } from '../ui/index';
import Icon from '../ui/icons';
import '../../styles/privacy.css';

const CATS = [
  { key: 'preferences', label: 'Preferences' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'marketing', label: 'Advertising' },
];
const CAT_LABEL = { essential: 'Essential', preferences: 'Preferences', analytics: 'Analytics', marketing: 'Advertising' };
const TYPES = [['cookie', 'Cookie'], ['local_storage', 'Local storage'], ['session_storage', 'Session storage']];
const ACTION_LABEL = { accept_all: 'Accepted all', reject_all: 'Rejected optional', custom: 'Chose some', withdraw: 'Withdrew' };

const editable = (p) => ({
  enabled: p.enabled !== false,
  bannerTitle: p.bannerTitle || '',
  bannerText: p.bannerText || '',
  essentialDescription: p.essentialDescription || '',
  categories: Object.fromEntries(CATS.map(({ key }) => [key, { enabled: !!p.categories?.[key]?.enabled, description: p.categories?.[key]?.description || '' }])),
  integrations: { ga4MeasurementId: p.integrations?.ga4MeasurementId || '', metaPixelId: p.integrations?.metaPixelId || '' },
  items: (p.items || []).map((x) => ({ ...x })),
  sections: (p.sections || []).map((x) => ({ ...x })),
  contactEmail: p.contactEmail || '',
  consentDays: p.consentDays || 180,
});

export default function CookiePolicyCard() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    getCookiePolicy()
      .then((r) => { setData(r.data); setForm(editable(r.data.policy)); setError(''); })
      .catch((e) => setError(e?.message || 'Could not load the cookie policy'));
    getCookieConsents(30).then((r) => setStats(r.data)).catch(() => setStats(null));
  };
  useEffect(load, []);

  const saved = useMemo(() => (data ? JSON.stringify(editable(data.policy)) : ''), [data]);
  const dirty = !!form && JSON.stringify(form) !== saved;

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!form || !data) return <div className="card"><div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div></div>;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setCat = (key, patch) => setForm((f) => ({ ...f, categories: { ...f.categories, [key]: { ...f.categories[key], ...patch } } }));
  const setItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setSec = (i, patch) => setForm((f) => ({ ...f, sections: f.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const anyOptional = CATS.some(({ key }) => form.categories[key].enabled);

  const save = async () => {
    setSaving(true);
    const before = data.policy.version;
    try {
      const r = await saveCookiePolicy(form);
      setData(r.data);
      setForm(editable(r.data.policy));
      toast.success(r.data.policy.version > before ? 'Saved — visitors will be asked for their choice again' : 'Cookie policy saved');
    } catch (e) { toast.error(e?.message || 'Could not save the cookie policy'); } finally { setSaving(false); }
  };
  const reset = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Put the cookie policy back to the platform\'s default wording and switch every optional category off?')) return;
    setSaving(true);
    try { const r = await resetCookiePolicy(); setData(r.data); setForm(editable(r.data.policy)); toast.success('Back to the default cookie policy'); } catch (e) { toast.error(e?.message || 'Could not reset'); } finally { setSaving(false); }
  };

  const autoItems = data.page.items.filter((x) => !form.items.some((y) => y.name === x.name && y.provider === x.provider))
    .filter((x) => !(data.policy.items || []).some((y) => y.name === x.name && y.provider === x.provider));
  const preview = {
    title: form.bannerTitle || 'Cookies on this site',
    text: form.bannerText || (anyOptional
      ? 'We use essential storage to keep the site working. With your permission we would also like to use optional cookies — choose which, or accept or reject them all. You can change your mind at any time.'
      : 'This site uses only essential storage, to keep you signed in and remember your choices. No tracking or advertising cookies are used.'),
  };

  return (
    <>
      <Panel icon="shield" tone="indigo" title="Cookie banner"
        desc="Shown at the foot of your admission portal until a visitor answers it. A new answer is asked for when what visitors agree to changes."
        action={<span className="ckset__auto">Version {data.policy.version}</span>}>
        <label className="setcheck">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span><b>Show the cookie banner on the admission portal</b><small>Off: the portal still links to the cookie policy, but asks nothing. Optional cookies then never run.</small></span>
        </label>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label" htmlFor="ck-title">Heading</label>
            <input id="ck-title" data-text="title" className="form-control" maxLength={80} value={form.bannerTitle} onChange={(e) => set({ bannerTitle: e.target.value })} placeholder="Cookies on this site" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ck-days">Remember a visitor&rsquo;s choice for (days)</label>
            <input id="ck-days" type="number" min="30" max="365" step="1" className="form-control" value={form.consentDays} onChange={(e) => set({ consentDays: Number(e.target.value) || 0 })} />
            <div className="form-hint">30 to 365. After that the banner asks again.</div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ck-text">Text</label>
          <textarea id="ck-text" className="form-control" rows={3} maxLength={600} value={form.bannerText} onChange={(e) => set({ bannerText: e.target.value })}
            placeholder="Leave empty to use wording that matches the categories you switch on" />
        </div>
        <div className="ckset__preview" aria-label="Banner preview">
          <div className="ckb__in">
            <div className="ckb__text"><h2>{preview.title}</h2><p>{preview.text} <a href={data.portalUrl || '#'} onClick={(e) => { if (!data.portalUrl) e.preventDefault(); }} target="_blank" rel="noreferrer">Read the cookie policy</a></p></div>
            <div className="ckb__acts">
              {anyOptional ? (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" tabIndex={-1}>Choose</button>
                  <button type="button" className="btn btn-primary btn-sm" tabIndex={-1}>Reject optional</button>
                  <button type="button" className="btn btn-primary btn-sm" tabIndex={-1}>Accept all</button>
                </>
              ) : <button type="button" className="btn btn-primary btn-sm" tabIndex={-1}>OK</button>}
            </div>
          </div>
        </div>
      </Panel>

      <Panel icon="sliders" tone="violet" title="Categories"
        desc="Essential storage is always on. Optional categories are asked for on the banner — switch one on only when something on the portal really uses it.">
        <div className="ckset__cats">
          <div className="ckset__cat">
            <label><Icon name="lock" size={16} /> Essential <span className="ckset__auto">Always on</span></label>
            <textarea className="form-control" rows={2} maxLength={600} value={form.essentialDescription} onChange={(e) => set({ essentialDescription: e.target.value })} aria-label="Essential description" />
          </div>
          {CATS.map(({ key, label }) => (
            <div className="ckset__cat" key={key}>
              <label>
                <input type="checkbox" checked={form.categories[key].enabled} onChange={(e) => setCat(key, { enabled: e.target.checked })} />
                {label}
              </label>
              <textarea className="form-control" rows={2} maxLength={600} value={form.categories[key].description} onChange={(e) => setCat(key, { description: e.target.value })} aria-label={`${label} description`} />
              {key === 'analytics' ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="ck-ga">Google Analytics 4 measurement ID</label>
                  <input id="ck-ga" data-text="token" className="form-control" placeholder="G-XXXXXXXXXX" value={form.integrations.ga4MeasurementId} disabled={!form.categories.analytics.enabled}
                    onChange={(e) => set({ integrations: { ...form.integrations, ga4MeasurementId: e.target.value.toUpperCase() } })} />
                </div>
              ) : null}
              {key === 'marketing' ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="ck-px">Meta Pixel ID</label>
                  <input id="ck-px" data-text="digits" className="form-control" placeholder="Digits only" value={form.integrations.metaPixelId} disabled={!form.categories.marketing.enabled}
                    onChange={(e) => set({ integrations: { ...form.integrations, metaPixelId: e.target.value.replace(/\D/g, '') } })} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="setnote"><Icon name="info" size={14} /> Analytics and advertising tags load only on the portal&rsquo;s public pages (its front page and this policy), only after a visitor agrees, and never on a page with an applicant&rsquo;s own details. Do not use them to target children.</p>
      </Panel>

      <Panel icon="layers" tone="teal" title="What is stored"
        desc="Listed on the policy page. The platform's own items and your tags' cookies are added for you; add anything else your portal or website sets.">
        <div className="ckset__tablewrap">
          <table className="ckset__items">
            <thead><tr><th>Name</th><th>Set by</th><th>Category</th><th>Kind</th><th>Kept for</th><th>Why</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {autoItems.map((x) => (
                <tr key={`auto-${x.name}`}>
                  <td><code>{x.name}</code></td><td>{x.provider}</td><td>{x.categoryLabel}</td>
                  <td>{TYPES.find((t) => t[0] === x.type)?.[1] || x.type}</td><td>{x.duration}</td><td>{x.purpose}</td>
                  <td><span className="ckset__auto">Added for you</span></td>
                </tr>
              ))}
              {form.items.map((x, i) => (
                <tr key={`own-${i}`}>
                  <td><input data-text="token" className="form-control" maxLength={80} value={x.name} onChange={(e) => setItem(i, { name: e.target.value })} aria-label={`Item ${i + 1} name`} /></td>
                  <td><input data-text="title" className="form-control" maxLength={80} value={x.provider} onChange={(e) => setItem(i, { provider: e.target.value })} aria-label={`Item ${i + 1} set by`} /></td>
                  <td>
                    <select className="form-control" value={x.category} onChange={(e) => setItem(i, { category: e.target.value })} aria-label={`Item ${i + 1} category`}>
                      {Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k} disabled={k !== 'essential' && !form.categories[k]?.enabled}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="form-control" value={x.type} onChange={(e) => setItem(i, { type: e.target.value })} aria-label={`Item ${i + 1} kind`}>
                      {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td><input data-text="title" className="form-control" maxLength={60} value={x.duration} onChange={(e) => setItem(i, { duration: e.target.value })} aria-label={`Item ${i + 1} kept for`} placeholder="1 year" /></td>
                  <td><input className="form-control" maxLength={300} value={x.purpose} onChange={(e) => setItem(i, { purpose: e.target.value })} aria-label={`Item ${i + 1} purpose`} /></td>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ items: form.items.filter((_, j) => j !== i) })} aria-label={`Remove item ${i + 1}`}><Icon name="trash" size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {form.items.length < 40 ? (
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => set({ items: [...form.items, { name: '', provider: '', category: 'essential', type: 'cookie', duration: '', purpose: '' }] })}>
            <Icon name="plus" size={15} /> Add an item
          </button>
        ) : null}
      </Panel>

      <Panel icon="files" tone="amber" title="The policy's words"
        desc="Each section becomes a heading and its text on the policy page. A blank line starts a new paragraph.">
        {form.sections.map((s, i) => (
          <div className="ckset__sec" key={i}>
            <div className="ckset__row">
              <input data-text="title" className="form-control" style={{ flex: '1 1 260px' }} maxLength={120} value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} aria-label={`Section ${i + 1} heading`} />
              <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} aria-label="Move up"
                onClick={() => set({ sections: form.sections.map((x, j, a) => (j === i - 1 ? a[i] : j === i ? a[i - 1] : x)) })}><Icon name="arrowUp" size={15} /></button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={form.sections.length <= 1} aria-label="Remove section"
                onClick={() => set({ sections: form.sections.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button>
            </div>
            <textarea className="form-control" rows={4} maxLength={4000} value={s.body} onChange={(e) => setSec(i, { body: e.target.value })} aria-label={`Section ${i + 1} text`} />
          </div>
        ))}
        {form.sections.length < 20 ? (
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ sections: [...form.sections, { title: '', body: '' }] })}>
            <Icon name="plus" size={15} /> Add a section
          </button>
        ) : null}
        <div className="form-group">
          <label className="form-label" htmlFor="ck-mail">Questions about privacy go to</label>
          <input id="ck-mail" data-text="email" type="email" className="form-control" maxLength={200} value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="office@school.example" />
        </div>
      </Panel>

      <div className="setfoot">
        <span className="setfoot__hint">
          {dirty ? 'Unsaved changes to the cookie policy.' : 'Everything here is saved.'}{' '}
          {data.portalUrl ? <a href={data.portalUrl} target="_blank" rel="noreferrer">Open it on the portal</a> : null}
          {data.portalUrl ? ' · ' : ''}<a href={data.appUrl} target="_blank" rel="noreferrer">Open it in the app</a>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={reset} disabled={saving}>Reset to default</button>
          {dirty ? <button type="button" className="btn btn-secondary" onClick={() => setForm(editable(data.policy))} disabled={saving}>Discard</button> : null}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save cookie policy'}</button>
        </div>
      </div>

      <Panel icon="barsUp" tone="green" title="Answers to the banner"
        desc="The last 30 days. Each answer is kept with the policy version it was given for; addresses are stored only as a one-way hash."
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => openProtected(cookieConsentsCsvUrl(365), { download: true, filename: 'cookie-consents.csv' }).catch((e) => toast.error(e.message))}><Icon name="download" size={15} /> Download a year</button>}>
        {stats ? (
          <div className="ckset__stats">
            {['accept_all', 'reject_all', 'custom', 'withdraw'].map((a) => (
              <div className="ckset__stat" key={a}><b>{stats.byAction[a] || 0}</b><span>{ACTION_LABEL[a]}</span></div>
            ))}
          </div>
        ) : <p className="text-muted text-sm">No answers recorded yet.</p>}
      </Panel>
    </>
  );
}
