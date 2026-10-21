/**
 * Filling in an application, a section at a time. Answers are saved as they
 * are typed (a second after the last keystroke), documents upload as soon as
 * they are chosen, and the last step checks everything with the server before
 * submitting — the same rules the server applies, so a submission never fails
 * for a reason the applicant was not shown.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portal as api, openProtected } from '../../../api/admission.api';
import { openCheckout } from '../../../utils/razorpay';
import FormRenderer from '../FormRenderer';
import { visibleSections, quickErrors, savable } from '../formLogic';
import { Btn, Note, Ico, Panel, ConfirmDialog, Field, KV } from '../admUI';
import { money, errMsg } from '../meta';
import DigiLockerPanel from './DigiLockerPanel';

export default function Wizard({ detail, slug, reload, user }) {
  const nav = useNavigate();
  const app = detail.application;
  const scope = { classId: app.class, roundId: app.round };
  const [values, setValues] = useState(() => ({ ...app.data }));
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState('saved');   // saved | pending | saving | error
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState({});
  const [discarding, setDiscarding] = useState(false);
  // Steps the applicant has opened, and whether they have tried to submit: a
  // step is only marked as needing attention once it has been seen and left —
  // never before they have even started it.
  const [seen, setSeen] = useState(() => new Set([0]));
  const [tried, setTried] = useState(false);
  const timer = useRef(null);
  const latest = useRef(values);
  latest.current = values;

  const docsByKey = useMemo(() => Object.fromEntries(detail.documents.files.map((d) => [d.docKey, d])), [detail.documents.files]);
  const types = useMemo(() => Object.fromEntries(detail.documents.requirements.map((r) => [r.key, r])), [detail.documents.requirements]);
  const extraDocs = detail.documents.requirements.filter((r) => !r.fromForm);
  const sections = visibleSections(detail.schema, values, scope);
  const steps = [
    ...sections.map((s) => ({ key: s.key, title: s.title, sections: [s.key] })),
    ...(extraDocs.length ? [{ key: '__docs', title: 'Other documents' }] : []),
    { key: '__review', title: 'Review & submit' },
  ];
  const current = steps[Math.min(step, steps.length - 1)];

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    setSaving('saving');
    try {
      const r = await api.save(app._id, savable(detail.schema, latest.current));
      setSaving(Object.keys(r.errors || {}).length ? 'error' : 'saved');
      setErrors((e) => ({ ...e, ...(r.errors || {}) }));
      return true;
    } catch (e) {
      setSaving('error');
      if (e?.status === 409) { toast.error(errMsg(e)); reload(); }
      return false;
    }
  }, [app._id, detail.schema, reload]);

  // Saved a moment after the last change, and before the page is left.
  const change = (key, v) => {
    setValues((x) => ({ ...x, [key]: v }));
    setErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });
    setSaving('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e) => { if (saving === 'pending' || saving === 'saving') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);

  const go = async (i) => {
    if (saving === 'pending') await save();
    setSeen((x) => new Set([...x, step, i]));
    setStep(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const doUpload = async (docKey, file) => {
    const t = types[docKey];
    if (t?.maxSizeMB && file.size > t.maxSizeMB * 1024 * 1024) { toast.error(`${t.name}: the file must be at most ${t.maxSizeMB} MB`); return; }
    setUpload((u) => ({ ...u, [docKey]: 0 }));
    try {
      await api.upload(app._id, docKey, file, (p) => setUpload((u) => ({ ...u, [docKey]: Math.round((p.loaded / (p.total || 1)) * 100) })));
      toast.success(`${t?.name || 'Document'} uploaded`);
      await reload();
    } catch (e) { toast.error(errMsg(e, 'The upload failed')); } finally { setUpload((u) => { const n = { ...u }; delete n[docKey]; return n; }); }
  };
  const docs = {
    byKey: docsByKey, types, busy: upload, onUpload: doUpload,
    onOpen: (d) => openProtected(api.docUrl(app._id, d._id)).catch((e) => toast.error(e.message)),
    onRemove: async (d) => { try { await api.removeDoc(app._id, d._id); await reload(); } catch (e) { toast.error(errMsg(e)); } },
  };

  const problems = quickErrors(detail.schema, values, scope, { docsUploaded: Object.fromEntries(Object.keys(docsByKey).map((k) => [k, true])) });
  for (const r of extraDocs) if (r.required && !docsByKey[r.key]) problems[`doc:${r.key}`] = `${r.name} — upload the document`;
  const stepOf = (key) => {
    if (key.startsWith('doc:')) return steps.findIndex((s) => s.key === '__docs');
    const sec = sections.find((s) => s.fields.some((f) => f.key === key));
    return sec ? steps.findIndex((s) => s.key === sec.key) : -1;
  };
  const stepHasError = (i) => Object.keys(errors).some((k) => stepOf(k) === i)
    || ((tried || (seen.has(i) && i !== step)) && Object.keys(problems).some((k) => stepOf(k) === i));
  const feeFirst = detail.feeBeforeSubmit && detail.fees.application.status === 'due' && detail.fees.application.due > 0;

  const pay = async () => {
    setBusy(true);
    try {
      const order = await api.payOrder(app._id, 'application_fee');
      await openCheckout({
        order: order.data, amount: order.data.due, name: 'Application fee', description: app.studentName || 'Application',
        prefillName: user?.name, prefillEmail: user?.email,
        onVerify: async (resp) => {
          try { await api.payVerify(app._id, resp); toast.success('Payment received'); reload(); } catch (e) { toast.error(errMsg(e)); }
        },
        onError: (e) => toast.error(e.message),
      });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    setTried(true);
    try {
      clearTimeout(timer.current);
      const r = await api.submit(app._id, savable(detail.schema, values));
      toast.success(r.message || 'Application submitted');
      reload();
    } catch (e) {
      const list = e?.data?.errors || [];
      if (list.length) {
        const map = Object.fromEntries(list.map((x) => [x.path, x.message]));
        setErrors(map);
        const first = stepOf(list[0].path);
        if (first >= 0) setStep(first);
      }
      toast.error(errMsg(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="adm-wizard">
      <nav className="adm-wizard__nav" aria-label="Application sections">
        {steps.map((s, i) => (
          <button key={s.key} type="button" className={`adm-wizard__step ${i === step ? 'is-on' : ''} ${seen.has(i) && i !== step && !stepHasError(i) ? 'is-done' : ''} ${stepHasError(i) && i !== step ? 'has-error' : ''}`} onClick={() => go(i)}>
            <span className="adm-wizard__num">{seen.has(i) && i !== step && !stepHasError(i) ? <Ico name="check" size={12} /> : i + 1}</span>{s.title}
          </button>
        ))}
      </nav>
      <Panel
        title={current.title}
        sub={`Step ${Math.min(step, steps.length - 1) + 1} of ${steps.length}`}
        right={<span className="adm-saved">{saving === 'saving' ? <><span className="adm-spin adm-spin--sm" style={{ borderColor: '#c7d2fe', borderTopColor: 'var(--primary)' }} />Saving…</> : saving === 'pending' ? 'Unsaved changes' : saving === 'error' ? <><Ico name="alert" size={13} />Some answers need attention</> : <><Ico name="checkCircle" size={13} />Saved</>}</span>}>
        {app.status === 'incomplete' ? <Note tone="amber" icon="alert">The school has sent this application back. Check the latest update, correct what was asked for, and submit it again.</Note> : null}
        {detail.migration ? <Note tone="indigo" icon="info">The school updated its form{detail.migration.added?.length ? ` — new: ${detail.migration.added.slice(0, 4).join(', ')}` : ''}. Your earlier answers have been kept.</Note> : null}
        {current.key === '__docs' || (current.key === '__review' && !extraDocs.length)
          ? <div style={{ marginTop: 12 }}><DigiLockerPanel appId={app._id} requirements={detail.documents.requirements} onFetched={reload} /></div> : null}
        <div style={{ marginTop: 12 }}>
          {current.key === '__docs' ? (
            <div className="adm-doclist">
              {extraDocs.map((r) => (
                <Field key={r.key} label={r.name} required={r.required} hint={r.description} error={errors[`doc:${r.key}`]}>
                  <FormRenderer schema={{ sections: [{ key: 'x', title: '', fields: [{ key: `doc_${r.key}`, type: 'file', label: r.name, docType: r.key, required: r.required }] }] }} values={{}} docs={docs} />
                </Field>
              ))}
            </div>
          ) : current.key === '__review' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.keys(problems).length ? (
                <Note tone="amber" icon="alert">
                  <b>Before you submit:</b>
                  <ul style={{ margin: '6px 0 0 18px' }}>{Object.entries(problems).slice(0, 12).map(([k, m]) => <li key={k}><button type="button" className="adm-linkbtn" onClick={() => go(Math.max(0, stepOf(k)))}>{m}</button></li>)}</ul>
                </Note>
              ) : <Note tone="green" icon="checkCircle">Everything required is filled in. Check the answers below, then submit.</Note>}
              {feeFirst ? (
                <Note tone="amber" icon="wallet" action={detail.fees.online ? <Btn kind="primary" size="sm" busy={busy} onClick={pay}>Pay {money(detail.fees.application.due)}</Btn> : null}>
                  The application fee of <b>{money(detail.fees.application.due)}</b> is paid before submitting.{detail.fees.online ? '' : ' Online payment is not available — please pay at the school office; it will appear here once recorded.'}
                </Note>
              ) : null}
              <KV items={[['Class', detail.className], ['Academic year', detail.yearName], ['Round', detail.round?.name]]} cols={3} />
              <FormRenderer schema={detail.schema} values={values} scope={scope} readOnly docs={{ byKey: docsByKey, types }} />
            </div>
          ) : (
            <FormRenderer schema={detail.schema} values={values} onChange={change} errors={errors} scope={scope} sectionKeys={current.sections} docs={docs} />
          )}
        </div>
        <div className="adm-wizard__foot">
          <div className="adm-row">
            {step > 0 ? <Btn icon="arrowLeft" onClick={() => go(step - 1)}>Back</Btn> : null}
            {detail.canDelete ? <Btn kind="ghost" icon="trash" onClick={() => setDiscarding(true)}>Delete draft</Btn> : null}
          </div>
          {current.key === '__review'
            ? <Btn kind="primary" size="lg" icon="send" busy={busy} disabled={feeFirst} onClick={submit}>{app.status === 'incomplete' ? 'Submit again' : 'Submit application'}</Btn>
            : <Btn kind="primary" onClick={() => go(step + 1)}>Save & continue<Ico name="arrowRight" size={15} /></Btn>}
        </div>
      </Panel>
      <ConfirmDialog open={discarding} onClose={() => setDiscarding(false)} title="Delete this draft?"
        message="The answers and documents in this draft will be deleted. This cannot be undone." confirmLabel="Delete draft"
        onConfirm={async () => { try { await api.discard(app._id); toast.success('Draft deleted'); nav(`/${slug}/dashboard`); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </div>
  );
}
