/**
 * ID Card Settings (Oct 2026) — what every card says about the school (name,
 * tagline, logo, return address and contact), who signs it, and the module's
 * rules. A field left empty prints the school's own record, so a school that
 * never opens this page still prints correct cards.
 *
 * Like a template, the cards in use keep the identity they were issued with
 * until the office applies the change to them (offered after saving).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getIdCardSettings, saveIdCardSettings, applyIdCardSettings, uploadIdCardImage, removeIdCardImage, getIdCardTemplates,
} from '../../../api/idcards.api';
import IdCard3D from '../IdCard3D';
import PhoneInput from '../../../components/ui/PhoneInput';
import { phoneError, phoneInputValue } from '../../../utils/validators';
import { Page, PageHead, Panel, Btn, Ico, Field, Switch, Segmented, Spin, Empty, Note, useLoad } from '../icUI';
import { errorText, fileUrl, plural } from '../icMeta';
import { Dialog } from './dialogs';

const TEXT = ['displayName', 'tagline', 'address', 'phone', 'email', 'website', 'signatoryName', 'signatoryTitle'];
const RULES = ['requirePhoto', 'verifyShowPhoto', 'notifyOnIssue'];
const pickForm = (s) => Object.fromEntries([...TEXT, ...RULES].map((k) => [k, s?.[k] ?? (RULES.includes(k) ? false : '')]));

function ImageSlot({ label, hint, path, fallback, onUpload, onRemove, busy, dark }) {
  const file = useRef(null);
  const url = fileUrl(path || fallback);
  return (
    <div className="ics-image">
      <div className={`ics-image__box${dark ? ' is-dark' : ''}`}>{url ? <img src={url} alt="" /> : <Ico name="fileImage" size={26} />}</div>
      <div className="ics-image__text">
        <strong>{label}</strong>
        <span>{path ? 'Uploaded for ID cards' : fallback ? 'Using the school’s own' : hint}</span>
        <div className="ics-image__acts">
          <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
          <Btn size="sm" icon="upload" busy={busy} onClick={() => file.current?.click()}>{path ? 'Replace' : 'Upload'}</Btn>
          {path ? <Btn size="sm" kind="ghost" icon="trash" onClick={onRemove}>Remove</Btn> : null}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data, loading, error, reload } = useLoad(() => getIdCardSettings(), 'settings');
  const tpl = useLoad(() => getIdCardTemplates(), 'templates');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [side, setSide] = useState('front');
  const [apply, setApply] = useState(0);
  const [applying, setApplying] = useState(false);

  useEffect(() => { if (data) setForm(pickForm(data.settings)); }, [data]);
  const saved = useMemo(() => (data ? pickForm(data.settings) : null), [data]);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k) => (e) => set(k)(e.target.value);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const preview = useMemo(() => {
    if (!data || !form || !tpl.data) return null;
    const s = data.settings; const sch = data.school;
    const t = tpl.data;
    const sample = t.samples?.student || { name: 'Aarav Sharma', holderCode: 'APS2026017', className: 'Class VIII', sectionName: 'B', rollNumber: '12', dob: '2013-05-14', bloodGroup: 'B+' };
    const identity = {
      name: form.displayName || sch.name, tagline: form.tagline, logo: s.logo || sch.logo,
      address: form.address || sch.address, phone: form.phone || sch.phone, email: form.email || sch.email, website: form.website || sch.website,
    };
    const look = t.templates.student.design;
    return {
      _id: 'settings-preview', kind: 'student', number: 'ST2627-00042', status: 'active', reissueNo: 0,
      snapshot: { ...sample, yearName: t.year?.yearName || '2026-27', yearEnd: t.year?.endDate ? String(t.year.endDate).slice(0, 10) : '2027-03-31' },
      design: { ...look, backNote: String(look.backNote || '').replace(/\{school\}/g, identity.name), identity, signatory: { name: form.signatoryName, title: form.signatoryTitle || 'Principal', signature: s.signature } },
      validUntil: t.year?.endDate || null, issuedAt: new Date().toISOString(), qrSvg: t.sampleQr,
    };
  }, [data, form, tpl.data]);

  const save = async () => {
    const badPhone = phoneError(form.phone, 'Phone');
    if (badPhone) { toast.error(badPhone); return; }
    setBusy('save');
    try {
      const r = await saveIdCardSettings(form);
      toast.success(r.message || 'Settings saved');
      await reload();
      tpl.reload();
      if (r.data?.liveCount) setApply(r.data.liveCount);
    } catch (e) {
      toast.error(await errorText(e, 'The settings could not be saved'));
    } finally { setBusy(''); }
  };
  const upload = async (image, file) => {
    if (file.size > 5 * 1024 * 1024) { toast.error('Choose an image under 5 MB'); return; }
    setBusy(image);
    try {
      const r = await uploadIdCardImage(image, file);
      toast.success(r.message || 'Uploaded');
      await reload(); tpl.reload();
      if (r.data?.liveCount) setApply(r.data.liveCount);
    } catch (e) {
      toast.error(await errorText(e, 'The image could not be uploaded'));
    } finally { setBusy(''); }
  };
  const remove = async (image) => {
    setBusy(image);
    try {
      const r = await removeIdCardImage(image);
      toast.success(r.message || 'Removed');
      await reload(); tpl.reload();
    } catch (e) {
      toast.error(await errorText(e, 'The image could not be removed'));
    } finally { setBusy(''); }
  };
  const applyNow = async () => {
    setApplying(true);
    try {
      const r = await applyIdCardSettings();
      toast.success(r.message || 'Cards updated');
      setApply(0);
    } catch (e) {
      toast.error(await errorText(e, 'The cards could not be updated'));
    } finally { setApplying(false); }
  };

  if ((loading && !data) || !form) {
    if (error && !data) return <Page><Empty title="Settings could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></Page>;
    return <Page><Spin /></Page>;
  }
  const s = data.settings; const sch = data.school;

  return (
    <Page className="ics">
      <PageHead title="ID Card Settings" subtitle="What every card says about the school, who signs it, and the rules cards are issued by. Leave a field empty to print the school's own record." />
      <div className="ict-grid">
        <div className="ict-form">
          <Panel title="The school on the card" icon="school" tone="indigo">
            <div className="ics-grid2">
              <Field label="Name printed on cards" hint={`Empty: “${sch.name}”`}>
                <input className="ic-input" value={form.displayName} onChange={text('displayName')} placeholder={sch.name} maxLength={90} />
              </Field>
              <Field label="Tagline" hint="A line under the name — affiliation, motto">
                <input className="ic-input" value={form.tagline} onChange={text('tagline')} placeholder="e.g. Affiliated to CBSE · No. 1130256" maxLength={120} />
              </Field>
            </div>
            <ImageSlot label="Logo" hint="No logo yet — upload one, or add it in School Settings" path={s.logo} fallback={sch.logo}
              busy={busy === 'logo'} onUpload={(f) => upload('logo', f)} onRemove={() => remove('logo')} />
          </Panel>

          <Panel title="Return address & contact" sub="Printed on the back, under “If found, please return to”" icon="mapPin" tone="blue">
            <Field label="Address" hint={sch.address ? `Empty: “${sch.address}”` : 'The school has no address on record'}>
              <textarea className="ic-textarea" rows={2} value={form.address} onChange={text('address')} placeholder={sch.address || 'Street, area, city, PIN'} maxLength={200} />
            </Field>
            <div className="ics-grid3">
              <Field label="Phone"><PhoneInput className="ic-input" value={form.phone} onChange={text('phone')} placeholder={phoneInputValue(sch.phone) || '9876543210'} /></Field>
              <Field label="Email"><input className="ic-input" type="email" value={form.email} onChange={text('email')} placeholder={sch.email || 'office@school.edu'} maxLength={120} /></Field>
              <Field label="Website"><input className="ic-input" value={form.website} onChange={text('website')} placeholder={sch.website || 'www.school.edu'} maxLength={120} /></Field>
            </div>
          </Panel>

          <Panel title="Signatory" sub="Who signs the cards" icon="pencil" tone="violet">
            <div className="ics-grid2">
              <Field label="Name"><input data-text="name" className="ic-input" value={form.signatoryName} onChange={text('signatoryName')} placeholder="e.g. Dr. Meera Kulkarni" maxLength={80} /></Field>
              <Field label="Title printed under the signature"><input className="ic-input" value={form.signatoryTitle} onChange={text('signatoryTitle')} placeholder="Principal" maxLength={60} /></Field>
            </div>
            <ImageSlot label="Signature" hint="A scan on a white or clear background (PNG works best). Without one, a line is printed to sign on." path={s.signature}
              busy={busy === 'signature'} onUpload={(f) => upload('signature', f)} onRemove={() => remove('signature')} />
          </Panel>

          <Panel title="Rules" icon="shieldCheck" tone="green">
            <Switch checked={form.requirePhoto} onChange={set('requirePhoto')} label="A photo is required before a card is issued"
              hint="Off: a person with no photo gets a card with their initials, and the generate check lists them." />
            <Switch checked={form.verifyShowPhoto} onChange={set('verifyShowPhoto')} label="Show the photo when a card is verified"
              hint="Whoever scans the QR sees the holder's photo to compare with the card. Date of birth, phone and address are never shown." />
            <Switch checked={form.notifyOnIssue} onChange={set('notifyOnIssue')} label="Tell holders when their card is issued"
              hint="Students and their parents, teachers, staff and parents get a notification that the card is ready." />
          </Panel>
        </div>

        <aside className="ict-preview">
          <div className="ict-stage">
            <div className="ict-stage__top">
              <span>Live preview</span>
              <Segmented size="sm" value={side} onChange={setSide} label="Side" options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} />
            </div>
            {preview ? <IdCard3D card={preview} width={preview.design.layout === 'landscape' ? 230 : 250} flipped={side === 'back'} onFlip={(b) => setSide(b ? 'back' : 'front')} entrance={false} stamp={false} /> : <Spin />}
            <p className="ict-stage__who">A student card, as the student template draws it</p>
          </div>
          <div className="ict-actions">
            <span className="ict-actions__sp" />
            <Btn disabled={!dirty || !!busy} onClick={() => setForm(saved)}>Discard</Btn>
            <Btn kind="primary" icon="save" busy={busy === 'save'} disabled={!dirty} onClick={save}>Save settings</Btn>
          </div>
          {dirty ? <p className="ict-unsaved"><Ico name="info" size={14} />Unsaved changes.</p> : null}
          <Note tone="slate" icon="info">The ID Cards module stores its own copy of what it prints. Changing the school's name or logo in School Settings reaches new cards; cards in use follow when you apply it here.</Note>
        </aside>
      </div>

      <Dialog open={!!apply} onClose={() => !applying && setApply(0)} title="Update the cards in use?" icon="regen" tone="indigo"
        footer={<><Btn onClick={() => setApply(0)} disabled={applying}>Not now</Btn><Btn kind="primary" busy={applying} onClick={applyNow}>Update {plural(apply, 'card')}</Btn></>}>
        <p className="ic-dialog__lead">Cards issued from now on print the new details. <b>{plural(apply, 'card is', 'cards are')}</b> in use with the old ones — update them to show the new name, logo, address and signatory on screen and in their next print.</p>
        <Note tone="slate" icon="history">Cards of earlier years, and lost, replaced or cancelled cards, keep what they were issued with.</Note>
      </Dialog>
    </Page>
  );
}
