/**
 * Printing for a group (Oct 2026): emergency cards for a class, a bus route or
 * a trip's chosen students — a card each for the children with something to
 * know, a line with a number to call for everyone else — and the year's
 * health cards for a section (one page per student, for the families).
 * Every print is recorded in the medical audit, with its purpose.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Dialog, Btn, Field, Note, Segmented, Chips } from '../mdUI';
import { StudentPicker } from '../mdForm';
import { errorText } from '../mdMeta';
import { useMeta } from './mdForms';

export default function PrintCardsDialog({ open, onClose }) {
  const { meta } = useMeta();
  const [what, setWhat] = useState('cards');      // cards | annual
  const [from, setFrom] = useState('section');    // section | route | students
  const [sectionId, setSectionId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const classes = meta?.classes || [];
  const sections = classes.flatMap((c) => (c.sections || []).map((s) => ({ value: s._id, label: `${c.className} – ${s.sectionName}` })));
  const routes = meta?.routes || [];
  const go = async () => {
    setBusy(true);
    try {
      if (what === 'annual') {
        if (!sectionId) throw new Error('Choose the section');
        const label = sections.find((s) => s.value === sectionId)?.label || 'class';
        await api.downloadPdf(api.annualSetUrl(sectionId), `health-cards-${label}.pdf`);
      } else {
        const body = { title, purpose, ...(from === 'section' ? { sectionId } : from === 'route' ? { routeId } : { students: picked.map((s) => s._id) }) };
        if (from === 'section' && !sectionId) throw new Error('Choose the section');
        if (from === 'route' && !routeId) throw new Error('Choose the bus route');
        if (from === 'students' && !picked.length) throw new Error('Choose the students');
        await api.downloadPdfPost('/medical/admin/emergency-cards.pdf', body, `emergency-cards-${(title || 'set').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
      }
      toast.success('Printed — it is in the medical audit');
      onClose();
    } catch (e) { toast.error(e?.message && !e.status ? e.message : errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Print for a group" icon="printer" tone="red" width={620}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" icon="printer" busy={busy} onClick={go}>Print</Btn></>}>
      <Field label="What"><Segmented value={what} onChange={setWhat} label="What" options={[{ value: 'cards', label: 'Emergency cards' }, { value: 'annual', label: 'Annual health cards' }]} /></Field>
      {what === 'cards' ? (
        <>
          <Field label="For"><Segmented value={from} onChange={setFrom} label="For" options={[{ value: 'section', label: 'A class' }, ...(routes.length ? [{ value: 'route', label: 'A bus route' }] : []), { value: 'students', label: 'Chosen students (a trip)' }]} /></Field>
          {from === 'section' ? <Field label="Section" required><select className="md-input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">Choose…</option>{sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field> : null}
          {from === 'route' ? <Field label="Bus route" required><select className="md-input" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">Choose…</option>{routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field> : null}
          {from === 'students' ? (
            <Field label={`Students (${picked.length})`} required>
              <StudentPicker value={null} onChange={(s) => { if (s && !picked.some((x) => x._id === s._id)) setPicked([...picked, s]); }} fetcher={api.findMedStudents} />
              {picked.length ? <Chips multi options={picked.map((s) => ({ value: s._id, label: `${s.name} ✕` }))} value={picked.map((s) => s._id)} onPick={(id) => setPicked(picked.filter((s) => s._id !== id))} /> : null}
            </Field>
          ) : null}
          <div className="md-form__grid">
            <Field label="Title" optional><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Science centre trip, 12 Oct" maxLength={120} /></Field>
            <Field label="Purpose" optional hint="Kept in the audit"><input className="md-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. for the teachers on the trip" maxLength={200} /></Field>
          </div>
          <Note tone="amber" icon="alertTri">Medical information on paper: give it to the adult in charge, and collect or shred it afterwards.</Note>
        </>
      ) : (
        <>
          <Field label="Section" required><select className="md-input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">Choose…</option>{sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Note tone="indigo" icon="info">One page per student — growth on the WHO charts, the year&rsquo;s checkups and vaccinations, allergies and conditions, visits — to hand to each family.</Note>
        </>
      )}
    </Dialog>
  );
}
