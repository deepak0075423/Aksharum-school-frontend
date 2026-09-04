import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getReceiptTemplates, updateReceiptTemplate, fetchReceiptPreview } from '../../api/admin.api';
import { Button, Spinner } from '../ui/index';

// How a receipt looks, per module and per payment mode. The school picks one of
// the shipped designs and adjusts the wording, colour and which blocks appear —
// the preview is the real renderer, so what is shown here is exactly what a
// parent will open.

const MODULES = [
  ['fees',    'Fee receipts'],
  ['library', 'Library fine receipts'],
];

const TOGGLES = [
  ['showLogo',        'School logo'],
  ['showBreakdown',   'Itemised breakdown'],
  ['showPaymentMode', 'Payment mode'],
  ['showSignature',   'Signature line'],
];

export default function ReceiptDesignCard({ availableModules = {} }) {
  const modules = MODULES.filter(([key]) => availableModules[key]);
  // Not seeded from `modules` on first render: the caller's source can change
  // once the module list resolves, and a value captured in useState would stay
  // pinned to a module this school does not run — which is how a library-only
  // school ended up asking the server for fee templates.
  const [module, setModule] = useState('');
  const [mode,   setMode]   = useState('online');
  const [sameForBoth, setSame] = useState(true);
  const [presets, setPresets]  = useState([]);
  const [form,    setForm]     = useState(null);
  const [loading, setLoading]  = useState(true);
  const [saving,  setSaving]   = useState(false);
  const [preview, setPreview]  = useState('');
  // The receipt is as tall as its content — a fixed frame height cut the footer
  // and signature line off the bottom, which made the preview look broken.
  const frameRef = useRef(null);
  const [frameH, setFrameH] = useState(560);

  const load = (mod = module) => {
    setLoading(true);
    getReceiptTemplates(mod)
      .then(res => {
        const d = res?.data;
        setPresets(d?.presets || []);
        setSame(!!d?.sameForBoth);
        setForm(d?.[mode] || d?.online);
      })
      .catch(err => toast.error(err?.message || 'Could not load the receipt designs'))
      .finally(() => setLoading(false));
  };

  // Keep the selection inside what this school actually runs. Snaps to the
  // first available module on load, and away from one that disappears.
  const availableKeys = modules.map(([key]) => key).join(',');
  useEffect(() => {
    const keys = availableKeys ? availableKeys.split(',') : [];
    if (!keys.length) { setModule(''); return; }
    if (!keys.includes(module)) setModule(keys[0]);
  }, [availableKeys, module]);

  useEffect(() => {
    if (module && modules.some(([key]) => key === module)) load(module);
    /* eslint-disable-next-line */
  }, [module]);

  // Switching mode shows that mode's saved design, unless one design serves both.
  useEffect(() => {
    if (sameForBoth || !module) return;
    getReceiptTemplates(module).then(res => setForm(res?.data?.[mode])).catch(() => {});
    /* eslint-disable-next-line */
  }, [mode]);

  // Re-render the preview as the design changes, debounced so dragging the
  // colour picker does not fire a request per pixel.
  useEffect(() => {
    if (!form) return;
    let live = true;
    const t = setTimeout(() => {
      fetchReceiptPreview({
        module, paymentMode: mode,
        preset: form.preset, accentColor: form.accentColor,
        headerText: form.headerText, footerText: form.footerText,
        notes: form.notes, signatoryName: form.signatoryName,
        showLogo: String(!!form.showLogo), showBreakdown: String(!!form.showBreakdown),
        showSignature: String(!!form.showSignature), showPaymentMode: String(!!form.showPaymentMode),
      })
        .then(html => { if (live) setPreview(html); })
        .catch(() => { if (live) setPreview(''); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [form, module, mode]);

  /**
   * Grow the frame to the receipt inside it. srcDoc is same-origin here (the
   * sandbox keeps allow-same-origin), so the document can be measured; the
   * clamp stops a malformed render from producing a mile-long panel.
   */
  const fitFrame = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const h   = doc && Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0);
    if (h) setFrameH(Math.min(1400, Math.max(420, h)));
  }, []);

  // srcDoc swaps do not always fire load before the new document has laid out,
  // so the measurement is taken again on the next frame.
  useEffect(() => {
    if (!preview) return undefined;
    const t = setTimeout(fitFrame, 60);
    return () => clearTimeout(t);
  }, [preview, fitFrame]);

  if (!modules.length) return null;
  if (!module || loading || !form) {
    return <div className="card" style={{ marginTop: 16 }}>
      <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
    </div>;
  }

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [key]: v }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!modules.some(([key]) => key === module))
        return toast.error('That module is not enabled for this school');
      await updateReceiptTemplate({ ...form, module, paymentMode: mode, sameForBoth });
      toast.success(sameForBoth ? 'Design saved for both payment modes' : `Design saved for ${mode} payments`);
      load(module);
    } catch (err) { toast.error(err?.message || 'Could not save the design'); }
    finally { setSaving(false); }
  };


  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header"><strong>Receipt Designs</strong></div>
      <div className="card-body">
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          What a parent sees after paying. The preview on the right is the real receipt renderer with
          sample data — nothing is approximated.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {modules.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setModule(key)}
              className={`btn btn-${module === key ? 'primary' : 'secondary'} btn-sm`}>{label}</button>
          ))}
        </div>

        <form onSubmit={save}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={sameForBoth} onChange={e => setSame(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong>Use one design for both counter and online payments</strong>
              <div className="form-hint" style={{ marginTop: 2 }}>
                Untick to design them separately — useful if counter receipts are printed on letterhead.
              </div>
            </span>
          </label>

          {!sameForBoth && (
            <div className="form-group" style={{ maxWidth: 260 }}>
              <label className="form-label">Designing the receipt for</label>
              <select className="form-control" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="online">Online payments</option>
                <option value="offline">Counter payments</option>
              </select>
            </div>
          )}

          <div className="rcpt-grid">
            <div>
              <div className="form-group">
                <label className="form-label">Design</label>
                <select className="form-control" value={form.preset} onChange={set('preset')}>
                  {presets.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
                <div className="form-hint">{presets.find(p => p.key === form.preset)?.blurb}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Accent colour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.accentColor || '#4F46E5'} onChange={set('accentColor')}
                    style={{ width: 46, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 6 }} />
                  <input className="form-control" value={form.accentColor || ''} onChange={set('accentColor')} placeholder="#4F46E5" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Line under the school name</label>
                <input className="form-control" value={form.headerText || ''} onChange={set('headerText')}
                  placeholder="e.g. Affiliated to CBSE · Affil. No. 1234567" />
              </div>

              <div className="form-group">
                <label className="form-label">Note on the receipt</label>
                <textarea className="form-control" rows={2} value={form.notes || ''} onChange={set('notes')}
                  placeholder="e.g. Fees once paid are not refundable." />
              </div>

              <div className="form-group">
                <label className="form-label">Footer</label>
                <input className="form-control" value={form.footerText || ''} onChange={set('footerText')}
                  placeholder="This is a computer-generated receipt." />
              </div>

              <div className="form-group">
                <label className="form-label">Signatory</label>
                <input className="form-control" value={form.signatoryName || ''} onChange={set('signatoryName')}
                  placeholder="e.g. Accounts Officer" />
              </div>

              <div className="form-group">
                <label className="form-label">Show on the receipt</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {TOGGLES.map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form[key]} onChange={set(key)} />
                      <span style={{ fontSize: '.9rem' }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" loading={saving}>Save design</Button>
            </div>

            <div>
              <div className="form-label" style={{ marginBottom: 6 }}>Preview</div>
              <iframe
                ref={frameRef}
                title="Receipt preview"
                srcDoc={preview}
                sandbox="allow-same-origin"
                onLoad={fitFrame}
                scrolling="no"
                style={{
                  width: '100%', height: frameH, display: 'block',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', background: '#fff',
                  transition: 'height .2s ease',
                }}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
