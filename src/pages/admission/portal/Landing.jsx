/**
 * The portal's front page: what the school says about its admissions, which
 * rounds and classes are open, how to apply, what to bring, and how to ask.
 * Everything here is the school's own content (Admission Settings → Portal).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pub } from '../../../api/admission.api';
import PhoneInput from '../../../components/ui/PhoneInput';
import { usePortal, useApplicantHere } from './PortalShell';
import { useHumanCheck } from './Captcha';
import { Panel, Btn, Field, Input, Select, TextArea, Chip, Ico, Note } from '../admUI';
import { fmtDate, money, errMsg } from '../meta';

function Enquiry({ slug, rounds, captcha }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', class: '', message: '' });
  const human = useHumanCheck(captcha);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const classes = [...new Map(rounds.flatMap((r) => r.classes).map((c) => [c._id, c])).values()];
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await pub.enquiry(slug, { ...f, ...human.body }); setSent(true); } catch (err) { toast.error(errMsg(err)); human.reset(); } finally { setBusy(false); }
  };
  if (sent) return <Note tone="green" icon="checkCircle">Thank you — the admission office will get back to you.</Note>;
  return (
    <form className="adm-grid2" onSubmit={go} noValidate>
      <Field label="Your name" required><Input value={f.name} onChange={set('name')} data-text="name" maxLength={80} /></Field>
      <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} maxLength={200} /></Field>
      <Field label="Mobile"><PhoneInput className="adm-input" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Class you are interested in">
        <Select value={f.class} onChange={set('class')}><option value="">Any</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}</Select>
      </Field>
      <Field label="Your question" className="adm-span2"><TextArea rows={3} value={f.message} onChange={set('message')} maxLength={1000} /></Field>
      {human.on ? <div className="adm-span2">{human.widget}</div> : null}
      <div className="adm-span2"><Btn type="submit" kind="primary" busy={busy} disabled={!f.name || (!f.email && !f.phone) || !human.ready}>Send enquiry</Btn></div>
    </form>
  );
}

export default function Landing() {
  const { slug, data } = usePortal();
  const nav = useNavigate();
  const signedIn = useApplicantHere();
  const p = data.portal;
  const open = p.status === 'open';
  const section = (type) => (p.sections || []).find((s) => s.type === type);
  const steps = section('steps');
  const faq = section('faq');
  const about = (p.sections || []).filter((s) => s.type === 'text' || s.type === 'highlights');
  const dates = section('dates');
  const docsSec = section('documents');
  const anyRound = data.rounds.length > 0;

  return (
    <>
      <section className="adm-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="adm-hero__eyebrow">{data.school.name}{data.school.board ? ` · ${data.school.board}` : ''}</div>
          <h1>{p.title || 'Admissions'}</h1>
          {p.tagline ? <p style={{ fontWeight: 600 }}>{p.tagline}</p> : null}
          {p.description ? <p>{p.description}</p> : null}
          <div className="adm-hero__acts">
            {signedIn ? (
              <Btn kind="light" size="lg" className="adm-btn--light" icon="arrowRight" onClick={() => nav(`/${slug}/dashboard`)}>Go to my applications</Btn>
            ) : open ? (
              <>
                <Btn kind="light" size="lg" className="adm-btn--light" onClick={() => nav(`/${slug}/register`)}>Start your application</Btn>
                <Btn size="lg" className="adm-btn--glass" onClick={() => nav(`/${slug}/login`)}>I already have an account</Btn>
              </>
            ) : (
              <Btn size="lg" className="adm-btn--glass" onClick={() => nav(`/${slug}/login`)}>Sign in to track an application</Btn>
            )}
          </div>
        </div>
        <div className="adm-hero__card">
          <h3>{open ? 'Admissions open' : p.status === 'maintenance' ? 'Back shortly' : 'Admissions closed'}</h3>
          {open && anyRound ? data.rounds.map((r) => (
            <div key={r._id} className="adm-hero__round">
              <strong>{r.name}{r.yearName ? ` · ${r.yearName}` : ''}</strong>
              <span>{r.closesAt ? `Apply by ${fmtDate(r.closesAt)}` : 'Applications open'}{r.campus ? ` · ${r.campus}` : ''}</span>
            </div>
          )) : <span style={{ opacity: 0.92, fontSize: '.92rem' }}>{p.closedMessage || 'Applications are not open at the moment.'}</span>}
        </div>
      </section>

      {p.instructions ? <Panel title="Before you begin" icon="info" tone="indigo"><div className="adm-prose">{p.instructions}</div></Panel> : null}

      {open && anyRound ? (
        <Panel title="Classes open for admission" icon="school" tone="teal">
          {data.rounds.map((r) => (
            <div key={r._id} style={{ marginBottom: 14 }}>
              {data.rounds.length > 1 ? <div className="adm-row" style={{ marginBottom: 8 }}><strong>{r.name}</strong>{r.closesAt ? <Chip tone="amber">Closes {fmtDate(r.closesAt)}</Chip> : null}</div> : null}
              {r.description ? <p className="adm-muted" style={{ marginBottom: 8 }}>{r.description}</p> : null}
              <div className="adm-classgrid">
                {r.classes.map((c) => (
                  <div key={c._id} className="adm-classcard">
                    <strong>{c.className}</strong>
                    <span>{c.applicationFee > 0 ? `Application fee ${money(c.applicationFee)}` : 'No application fee'}</span>
                    {c.eligibility?.minAgeYears != null || c.eligibility?.maxAgeYears != null ? (
                      <span>Age {c.eligibility.minAgeYears ?? '—'}–{c.eligibility.maxAgeYears ?? '—'} years{c.eligibility.ageOn ? ` on ${fmtDate(c.eligibility.ageOn)}` : ''}</span>
                    ) : null}
                    {c.eligibility?.dobFrom || c.eligibility?.dobTo ? <span>Born {c.eligibility.dobFrom ? `from ${fmtDate(c.eligibility.dobFrom)}` : ''} {c.eligibility.dobTo ? `to ${fmtDate(c.eligibility.dobTo)}` : ''}</span> : null}
                    {c.eligibility?.notes ? <span>{c.eligibility.notes}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      ) : null}

      {steps?.items?.length ? (
        <Panel title={steps.title || 'How to apply'} icon="listDots" tone="violet">
          <div className="adm-stepcards">
            {steps.items.map((it, i) => (
              <div key={i} className="adm-stepcard">
                <span className="adm-stepcard__n">{i + 1}</span>
                <div><strong>{it.title}</strong><p>{it.text}</p></div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {about.map((s) => (
        <Panel key={s.key} title={s.title} icon="school" tone="blue">
          {s.body ? <div className="adm-prose">{s.body}</div> : null}
          {s.items?.length ? <ul style={{ marginTop: 10, paddingLeft: 18 }}>{s.items.map((it, i) => <li key={i}><strong>{it.title}</strong> {it.text}</li>)}</ul> : null}
        </Panel>
      ))}

      <div className="adm-grid2">
        {dates ? (
          <Panel title={dates.title || 'Important dates'} icon="calendarDays" tone="amber">
            <div className="adm-checklist">
              {data.rounds.flatMap((r) => [
                r.opensAt ? [`${r.name}: applications open`, r.opensAt] : null,
                r.closesAt ? [`${r.name}: last date to apply`, r.closesAt] : null,
                r.documentDeadline ? [`${r.name}: documents by`, r.documentDeadline] : null,
              ]).filter(Boolean).concat(data.upcomingExams.map((e) => [`${e.name} (${e.mode})`, e.startsAt])).map(([label, d]) => (
                <div key={label} className="adm-checklist__item"><Ico name="calendar" size={15} />{label}<span style={{ marginLeft: 'auto', fontWeight: 650 }}>{fmtDate(d)}</span></div>
              ))}
              {(dates.items || []).map((it, i) => <div key={i} className="adm-checklist__item"><Ico name="calendar" size={15} />{it.title}<span style={{ marginLeft: 'auto', fontWeight: 650 }}>{it.text}</span></div>)}
              {!data.rounds.length && !(dates.items || []).length ? <span className="adm-muted">Dates will be announced here.</span> : null}
            </div>
          </Panel>
        ) : null}
        {docsSec ? (
          <Panel title={docsSec.title || 'Documents you will need'} icon="files" tone="teal">
            <div className="adm-checklist">
              {data.documents.map((d) => (
                <div key={d.key} className="adm-checklist__item"><Ico name={d.required ? 'checkCircle' : 'fileDoc'} size={15} />
                  <span>{d.name}{d.description ? <span className="adm-muted"> — {d.description}</span> : null}</span>
                  {!d.required ? <Chip tone="gray">If applicable</Chip> : null}
                </div>
              ))}
              {docsSec.body ? <div className="adm-prose">{docsSec.body}</div> : null}
            </div>
          </Panel>
        ) : null}
      </div>

      {faq?.items?.length ? (
        <Panel title={faq.title || 'Frequently asked questions'} icon="info" tone="indigo">
          <div className="adm-faq">{faq.items.map((it, i) => <details key={i}><summary>{it.title}</summary><p>{it.text}</p></details>)}</div>
        </Panel>
      ) : null}

      <div className="adm-grid2">
        <Panel title={p.help?.name || 'Admission office'} icon="lifebuoy" tone="green" sub={p.help?.text}>
          <div className="adm-checklist">
            {p.help?.phone || p.contact?.phone ? <div className="adm-checklist__item"><Ico name="phone" size={15} />{p.help?.phone || p.contact?.phone}</div> : null}
            {p.help?.email || p.contact?.email ? <div className="adm-checklist__item"><Ico name="mail" size={15} /><a href={`mailto:${p.help?.email || p.contact?.email}`}>{p.help?.email || p.contact?.email}</a></div> : null}
            {p.contact?.hours ? <div className="adm-checklist__item"><Ico name="clock" size={15} />{p.contact.hours}</div> : null}
            {data.school.address || p.contact?.address ? <div className="adm-checklist__item"><Ico name="mapPin" size={15} />{p.contact?.address || data.school.address}</div> : null}
          </div>
        </Panel>
        {p.enquiries ? <Panel title="Ask a question" icon="chat" tone="violet" sub="Not ready to apply yet? Leave your details and the office will call or write back."><Enquiry slug={slug} rounds={data.rounds} captcha={p.captcha} /></Panel> : null}
      </div>
    </>
  );
}
