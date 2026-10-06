/**
 * Card Templates (Oct 2026) — how each kind of card looks: layout, colours,
 * photo, where the QR goes, which optional fields print, the note on the
 * back. The preview beside the editor is the real card (IdCardFace in 3D)
 * with a real person of the school on it, so what you see is what prints.
 *
 * A card keeps the design it was issued with (services/idCardDesign). Saving
 * offers to bring the cards in use up to the new design; cards from years
 * gone by never change.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getIdCardTemplates, saveIdCardTemplate, applyIdCardTemplate } from '../../../api/idcards.api';
import IdCard3D from '../IdCard3D';
import { Page, PageHead, Panel, Btn, Ico, Segmented, Switch, Spin, Empty, Note, useLoad } from '../icUI';
import { KIND, KINDS, errorText, plural } from '../icMeta';
import { Dialog } from './dialogs';

const SAMPLE = {
  student: { name: 'Aarav Sharma', holderCode: 'APS2026017', className: 'Class VIII', sectionName: 'B', rollNumber: '12', dob: '2013-05-14', bloodGroup: 'B+', parentName: 'Rahul Sharma', emergencyPhone: '9822041234', address: '12, MG Road, Kothrud, Pune 411038' },
  teacher: { name: 'Priya Sharma', holderCode: 'EMP1024', designation: 'Senior Teacher', department: 'Mathematics', bloodGroup: 'O+', dob: '1986-02-11', joiningDate: '2015-06-01', phone: '9850011223', emergencyPhone: '9922030041' },
  staff: { name: 'Lata Joshi', holderCode: 'EMP2011', designation: 'Accountant', department: 'Accounts', bloodGroup: 'A+', dob: '1982-09-21', joiningDate: '2012-07-01', phone: '9850011050', emergencyPhone: '9922030082' },
  parent: { name: 'Rahul Sharma', holderCode: 'PAR10245', relationship: 'Father', children: [{ name: 'Aarav Sharma' }, { name: 'Ananya Sharma' }], phone: '9822041234' },
};
const NUMBER = { student: 'ST2627-00042', teacher: 'TC2026-0007', staff: 'SF2026-0003', parent: 'PR2026-00103' };

function Swatches({ presets, value, onChange, label }) {
  const custom = !presets.some((p) => p.hex.toLowerCase() === String(value).toLowerCase());
  return (
    <div className="ict-swatches" role="radiogroup" aria-label={label}>
      {presets.map((p) => (
        <button key={p.key} type="button" role="radio" aria-checked={p.hex.toLowerCase() === String(value).toLowerCase()} title={p.label}
          className={`ict-swatch${p.hex.toLowerCase() === String(value).toLowerCase() ? ' is-on' : ''}`} style={{ '--sw': p.hex }} onClick={() => onChange(p.hex)}>
          <span />
        </button>
      ))}
      <label className={`ict-swatch ict-swatch--custom${custom ? ' is-on' : ''}`} title="Choose any colour" style={{ '--sw': value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — any colour`} />
        <span><Ico name="palette" size={14} /></span>
      </label>
      <code className="ict-hex">{String(value).toUpperCase()}</code>
    </div>
  );
}

function Mini({ layout }) {
  return (
    <span className={`ict-mini ict-mini--${layout}`} aria-hidden>
      <i className="ict-mini__head" /><i className="ict-mini__photo" /><i className="ict-mini__line" /><i className="ict-mini__line ict-mini__line--s" />
    </span>
  );
}

export default function Templates() {
  const { data, loading, error, reload } = useLoad(() => getIdCardTemplates(), 'templates');
  const [kind, setKind] = useState('student');
  const [drafts, setDrafts] = useState({});
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apply, setApply] = useState(null);     // { kind, count }
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(KINDS.map((k) => [k, { ...data.templates[k].design, fields: { ...data.templates[k].design.fields } }])));
  }, [data]);

  const draft = drafts[kind];
  const saved = data?.templates?.[kind]?.design;
  const dirty = useMemo(() => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const dirtyKinds = KINDS.filter((k) => data && drafts[k] && JSON.stringify(drafts[k]) !== JSON.stringify(data.templates[k].design));
  const set = (key, value) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], [key]: value } }));
  const setField = (key, value) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], fields: { ...d[kind].fields, [key]: value } } }));

  // Leaving with unsaved designs asks first.
  useEffect(() => {
    if (!dirtyKinds.length) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyKinds.length]);

  const preview = useMemo(() => {
    if (!data || !draft) return null;
    const sample = data.samples?.[kind] || SAMPLE[kind];
    const y = data.year;
    return {
      _id: `preview-${kind}`, kind, number: NUMBER[kind], status: 'active', reissueNo: 0,
      snapshot: { ...SAMPLE[kind], ...sample, yearName: y?.yearName || '2026-27', yearEnd: y?.endDate ? String(y.endDate).slice(0, 10) : '2027-03-31' },
      design: { ...draft, backNote: String(draft.backNote || '').replace(/\{school\}/g, data.identity.name), identity: data.identity, signatory: data.signatory },
      validUntil: y?.endDate || null, issuedAt: new Date().toISOString(), qrSvg: data.sampleQr,
    };
  }, [data, draft, kind]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveIdCardTemplate(kind, draft);
      toast.success(r.message || 'Design saved');
      const live = r.data?.liveCount || 0;
      await reload();
      if (live) setApply({ kind, count: live });
    } catch (e) {
      toast.error(await errorText(e, 'The design could not be saved'));
    } finally { setBusy(false); }
  };
  const applyNow = async () => {
    setApplying(true);
    try {
      const r = await applyIdCardTemplate(apply.kind);
      toast.success(r.message || 'Design applied');
      setApply(null);
      reload();
    } catch (e) {
      toast.error(await errorText(e, 'The design could not be applied'));
    } finally { setApplying(false); }
  };

  if (loading && !data) return <Page><Spin /></Page>;
  if (error && !data) return <Page><Empty title="Templates could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></Page>;
  if (!draft || !preview) return <Page><Spin /></Page>;

  const cat = data.catalogue;
  const fields = cat.fields[kind] || [];

  return (
    <Page className="ict">
      <PageHead title="Card Templates" subtitle="How each kind of card looks. Cards keep the design they were issued with — when you save, you choose whether the cards in use follow." />

      <div className="ict-kinds" role="tablist" aria-label="Card type">
        {KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === kind} className={`ict-kind${k === kind ? ' is-on' : ''}`} onClick={() => { setKind(k); setBack(false); }}>
            <span className="ict-kind__dot" style={{ background: drafts[k]?.accent }} />
            <span className="ict-kind__text"><strong>{KIND[k].label} card</strong><em>{plural(data.liveCounts[k] || 0, 'card')} in use</em></span>
            {dirtyKinds.includes(k) ? <span className="ict-kind__dirty" title="Unsaved changes" /> : null}
          </button>
        ))}
      </div>

      <div className="ict-grid">
        <div className="ict-form">
          <Panel title="Layout" sub="Which way up the card is printed" icon="cardStack" tone="indigo">
            <div className="ict-layouts">
              {cat.layouts.map((l) => (
                <button key={l} type="button" className={`ict-layout${draft.layout === l ? ' is-on' : ''}`} onClick={() => set('layout', l)} aria-pressed={draft.layout === l}>
                  <Mini layout={l} />
                  <strong>{l === 'portrait' ? 'Portrait' : 'Landscape'}</strong>
                  <em>{l === 'portrait' ? 'Upright, hangs from a lanyard' : 'Sideways, wallet style'}</em>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Colours" sub="The school's colour heads every card; the card colour says which kind it is" icon="palette" tone="violet">
            <div className="ict-row">
              <span className="ict-row__label">School colour</span>
              <Swatches presets={cat.primaryPresets} value={draft.primary} onChange={(v) => set('primary', v)} label="School colour" />
            </div>
            <div className="ict-row">
              <span className="ict-row__label">{KIND[kind].label} card colour</span>
              <Swatches presets={cat.accentPresets} value={draft.accent} onChange={(v) => set('accent', v)} label="Card colour" />
            </div>
            <div className="ict-row">
              <span className="ict-row__label">Background</span>
              <Segmented size="sm" value={draft.pattern} onChange={(v) => set('pattern', v)} label="Background pattern"
                options={[{ value: 'guilloche', label: 'Security lines' }, { value: 'waves', label: 'Waves' }, { value: 'plain', label: 'Plain' }]} />
            </div>
            {String(draft.accent).toLowerCase() === String(draft.primary).toLowerCase() ? <Note tone="amber" icon="info">The two colours are the same — the card colour is what tells a student card from a staff card at a glance.</Note> : null}
          </Panel>

          <Panel title="Photo & QR code" icon="qr" tone="blue">
            <div className="ict-row">
              <span className="ict-row__label">Photo</span>
              <Segmented size="sm" value={draft.photoShape} onChange={(v) => set('photoShape', v)} label="Photo shape" options={[{ value: 'rounded', label: 'Passport' }, { value: 'circle', label: 'Round' }]} />
            </div>
            <div className="ict-row">
              <span className="ict-row__label">QR code</span>
              <Segmented size="sm" value={draft.qrOn} onChange={(v) => { set('qrOn', v); setBack(v === 'back'); }} label="QR code side" options={[{ value: 'back', label: 'On the back' }, { value: 'front', label: 'On the front' }]} />
            </div>
          </Panel>

          <Panel title="What the card shows" sub="Name, photo, class or designation, the year and the card number always print" icon="checkSquare" tone="green">
            <div className="ict-switches">
              <Switch checked={draft.showLogo} onChange={(v) => set('showLogo', v)} label="School logo" hint="From Settings, else the school's own logo." />
              <Switch checked={draft.showSignature} onChange={(v) => set('showSignature', v)} label={`${data.signatory?.title || 'Principal'}'s signature`} hint={data.signatory?.signature ? 'Uploaded in Settings.' : 'No signature uploaded yet — a line is printed to sign on.'} />
              <Switch checked={draft.showValidity} onChange={(v) => set('showValidity', v)} label={kind === 'student' ? 'Valid till date' : 'Issue date'} />
              <Switch checked={draft.showReturnAddress} onChange={(v) => set('showReturnAddress', v)} label="“If found, please return to”" hint="The school's address and contact on the back." />
            </div>
            <div className="ict-fields">
              {fields.map((f) => (
                <label key={f.key} className={`ict-field${draft.fields[f.key] ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={!!draft.fields[f.key]} onChange={(e) => setField(f.key, e.target.checked)} />
                  <span className="ict-field__box"><Ico name="check" size={12} /></span>
                  <span className="ict-field__label">{f.label}</span>
                  <em>{f.side === 'front' ? 'Front' : 'Back'}</em>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Note on the back" icon="fileDoc" tone="slate">
            <textarea className="ic-textarea" rows={3} value={draft.backNote} maxLength={cat.noteMax} onChange={(e) => set('backNote', e.target.value)} />
            <div className="ict-count"><span>{'{school}'} is printed as “{data.identity.name}”.</span><span>{String(draft.backNote || '').length} / {cat.noteMax}</span></div>
          </Panel>
        </div>

        <aside className="ict-preview">
          <div className="ict-stage">
            <div className="ict-stage__top">
              <span>Live preview</span>
              <Segmented size="sm" value={back ? 'back' : 'front'} onChange={(v) => setBack(v === 'back')} label="Side" options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} />
            </div>
            <IdCard3D key={`${kind}-${draft.layout}`} card={preview} width={draft.layout === 'landscape' ? 230 : 250} flipped={back} onFlip={setBack} entrance={false} stamp={false} />
            <p className="ict-stage__who">
              {data.samples?.[kind] ? <>Shown with <b>{data.samples[kind].name}</b>&rsquo;s details</> : 'Shown with sample details'}
            </p>
          </div>
          <div className="ict-actions">
            <Btn kind="ghost" icon="refresh" disabled={busy} onClick={() => setDrafts((d) => ({ ...d, [kind]: { ...cat.defaults[kind], fields: { ...cat.defaults[kind].fields } } }))}>Default design</Btn>
            <span className="ict-actions__sp" />
            <Btn disabled={!dirty || busy} onClick={() => setDrafts((d) => ({ ...d, [kind]: { ...saved, fields: { ...saved.fields } } }))}>Discard</Btn>
            <Btn kind="primary" icon="save" busy={busy} disabled={!dirty} onClick={save}>Save design</Btn>
          </div>
          {dirty ? <p className="ict-unsaved"><Ico name="info" size={14} />Unsaved changes to the {KIND[kind].label.toLowerCase()} card.</p> : null}
        </aside>
      </div>

      <Dialog open={!!apply} onClose={() => !applying && setApply(null)} title="Apply to the cards in use?" icon="palette" tone="violet"
        footer={<><Btn onClick={() => setApply(null)} disabled={applying}>Keep them as they are</Btn><Btn kind="primary" busy={applying} onClick={applyNow}>Apply to {plural(apply?.count || 0, 'card')}</Btn></>}>
        <p className="ic-dialog__lead">
          The new design is saved and every {KIND[apply?.kind || 'student']?.label.toLowerCase()} card issued from now on uses it.
          {' '}<b>{plural(apply?.count || 0, 'card is', 'cards are')}</b> in use with the old design — on screen and in their next print.
        </p>
        <Note tone="slate" icon="history">Only the look changes — names, numbers and QR codes stay. Cards of earlier years, and lost, replaced or cancelled cards, always keep the design they were issued with.</Note>
      </Dialog>
    </Page>
  );
}
