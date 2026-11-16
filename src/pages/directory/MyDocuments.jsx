/**
 * My Documents — a member of staff's own paperwork (Employee Directory).
 *
 * What the school office has asked for, where each document stands, and the
 * one thing that can be done about it: upload it, or — when the office turned
 * it down — upload it again, with their reason right beside the button. A new
 * file goes back to the office as "Re-submitted" and they are notified.
 *
 * Open to every member of staff whenever the school collects documents through
 * the directory, whatever their designation lets them see of the directory
 * itself: this is their own record, not anybody else's.
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyDocuments, uploadMyDocument, getMyRequests, createMyRequest } from '../../api/employeeDirectory.api';
import { Button, Modal, Select, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { usePageCrumbs } from '../../contexts/BreadcrumbContext';
import { useFileViewer } from '../documents/FileViewer';
import { ErrorState, fmtDate } from './parts';
import { PageTop } from './employeeParts';
import { DOC_STATE, DocState, REQUEST_STATE } from './documentParts';

const ACCEPT = '.pdf,.jpg,.jpeg,.png';

/** What each state asks of the employee, in one line. */
const NEXT = {
  missing:     'Not uploaded yet.',
  pending:     'Uploaded — the school office has not reviewed it yet. You can still replace it.',
  resubmitted: 'Your new copy is with the school office for review.',
  verified:    'Checked and accepted by the school office.',
  rejected:    'The school office could not accept this. Upload a new copy.',
};

function DocumentCard({ doc, onUpload, onView, busy }) {
  const input = useRef(null);
  const canUpload = doc.state !== 'verified';
  const verb = doc.state === 'missing' ? 'Upload' : doc.state === 'rejected' ? 'Upload again' : 'Replace';
  return (
    <article className={`edoc-card edoc-card--${doc.state}`}>
      <header className="edoc-card__head">
        <span className={`edoc-card__mark edoc-pill--${DOC_STATE[doc.state]?.tone || 'slate'}`}>
          <Icon name={doc.category === 'identity' ? 'idCard' : 'files'} size={20} />
        </span>
        <div className="edoc-card__id">
          <h3>{doc.label}</h3>
          <small>{doc.required ? 'Required' : 'Optional'} · {doc.category === 'identity' ? 'Identity' : 'Employment'}</small>
        </div>
        <DocState state={doc.state} />
      </header>

      <p className="edoc-card__next">{NEXT[doc.state]}</p>

      {(doc.state === 'rejected' || doc.state === 'resubmitted') && doc.comment && (
        <div className="edoc-card__why">
          <b><Icon name="alert" size={13} /> {doc.state === 'rejected' ? 'Why it was not accepted' : 'Why the earlier copy was not accepted'}</b>
          <p>&ldquo;{doc.comment}&rdquo;</p>
          {doc.reviewedAt && <small>{fmtDate(doc.reviewedAt)}</small>}
        </div>
      )}

      <footer className="edoc-card__foot">
        {doc.fileName && doc.state !== 'rejected' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onView(doc)}>
            <Icon name="eye" size={14} /> View
          </button>
        )}
        {canUpload && (
          <>
            <button type="button" className={`btn btn-sm ${doc.state === 'missing' || doc.state === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={!!busy} onClick={() => input.current?.click()}>
              {busy === doc.key ? <Spinner size="sm" /> : <Icon name="upload" size={14} />} {verb}
            </button>
            <input ref={input} type="file" accept={ACCEPT} hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(doc, f); }} />
          </>
        )}
      </footer>
    </article>
  );
}

export default function MyDocuments() {
  usePageCrumbs([{ label: 'My Documents' }]);
  const { data, loading, error, refetch } = useFetch(getMyDocuments, []);
  const [busy, setBusy] = useState('');
  const [fresh, setFresh] = useState(null);   // the payload an upload hands back
  const viewer = useFileViewer();

  const view = fresh || data;
  const documents = view?.documents || [];
  const outstanding = view?.outstanding || [];
  const reminders = view?.reminders || [];

  const upload = async (doc, file) => {
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      toast.error('Choose a PDF, JPG or PNG file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That file is over 5 MB — choose a smaller one');
      return;
    }
    setBusy(doc.key);
    try {
      const res = await uploadMyDocument(doc.key, file);
      setFresh(res?.data ?? res);
      toast.success(doc.state === 'rejected'
        ? `${doc.label} sent again — the school office has been told it is waiting for review`
        : `${doc.label} uploaded — the school office has been told it is waiting for review`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'The file could not be uploaded');
    } finally { setBusy(''); }
  };

  const open = (doc) => viewer.open([{
    originalName: `${doc.label}${(doc.fileName.match(/\.[a-z0-9]+$/i) || [''])[0]}`,
    filePath: doc.url,
  }], 0, doc.label);

  if (loading && !data) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page edl edoc-mine">
      <PageTop title="My Documents"
        subtitle="The documents the school office keeps on your staff record. Upload what is missing, and anything they ask you to send again.">
        <button type="button" className="btn btn-secondary" onClick={() => { setFresh(null); refetch(); }}>
          <Icon name="refresh" size={15} /> Refresh
        </button>
      </PageTop>

      {error ? <ErrorState error={error} onRetry={refetch} /> : !view?.hasProfile ? (
        <div className="verempty">
          <Icon name="info" size={26} />
          <p>Your staff record has not been set up yet.</p>
          <span>Ask the school office to complete it — your documents appear here once it is.</span>
        </div>
      ) : (
        <>
          {reminders.length > 0 && (
            <section className="edoc-ask">
              <Icon name="bell" size={20} />
              <div>
                <b>
                  The school office has asked for your documents
                  {reminders[0].sequence > 1 ? ` (reminder ${reminders[0].sequence})` : ''}
                </b>
                <p>
                  {fmtDate(reminders[0].sentAt)}{reminders[0].sentByName ? ` · ${reminders[0].sentByName}` : ''}
                  {reminders[0].message ? ` — “${reminders[0].message}”` : ''}
                </p>
              </div>
            </section>
          )}

          <div className={`edoc-summary${outstanding.length ? ' is-owing' : ''}`}>
            <Icon name={outstanding.length ? 'alert' : 'checkCircle'} size={18} />
            {outstanding.length
              ? <span><b>{outstanding.length} still needed:</b> {outstanding.map((o) => `${o.label}${o.reason === 'rejected' ? ' (upload again)' : ''}`).join(', ')}</span>
              : <span>Nothing is needed from you right now.</span>}
          </div>

          <div className="edoc-grid">
            {documents.map((d) => (
              <DocumentCard key={d.key} doc={d} busy={busy} onUpload={upload} onView={open} />
            ))}
          </div>

          <p className="edoc-foot"><Icon name="info" size={13} /> PDF, JPG or PNG, up to 5 MB. A document the office has verified can only be changed by them.</p>

          <Corrections />
        </>
      )}
      {viewer.node}
    </div>
  );
}

/**
 * "Something on my record is wrong."
 *
 * Staff cannot edit their own record — the office keeps it — so this is the
 * note that reaches the office, and where the answer comes back.
 */
function Corrections() {
  const { data, refetch } = useFetch(getMyRequests, []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ area: 'personal', message: '' });
  const [busy, setBusy] = useState(false);
  const requests = data?.requests || [];
  const areas = data?.areas || [];

  const send = async () => {
    if (form.message.trim().length < 10) { toast.error('Say what needs correcting, and what it should be'); return; }
    setBusy(true);
    try {
      await createMyRequest(form);
      toast.success('Sent to the school office — you will be notified when they answer');
      setOpen(false);
      setForm({ area: 'personal', message: '' });
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message || 'Could not send it'); }
    finally { setBusy(false); }
  };

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <div>
          <h2>Something on your record wrong?</h2>
          <p className="text-muted text-sm" style={{ marginTop: 2 }}>
            Your name, address, bank details and the rest are kept by the school office. Tell them what to correct.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          <Icon name="pencil" size={15} /> Ask for a correction
        </button>
      </div>
      {requests.length > 0 && (
        <div className="card-body">
          {requests.map((r) => (
            <div key={r._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <b>{r.areaLabel}</b> <span className="text-muted text-sm">· {fmtDate(r.createdAt)}</span>
                <div style={{ marginTop: 2 }}>&ldquo;{r.message}&rdquo;</div>
                {r.reply && <div className="text-muted text-sm" style={{ marginTop: 4 }}>The office: &ldquo;{r.reply}&rdquo;</div>}
              </div>
              <span className={`edoc-pill edoc-pill--${REQUEST_STATE[r.status]?.tone || 'amber'}`}>{REQUEST_STATE[r.status]?.label || r.status}</span>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title="Ask the office to correct your record"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={send}>Send to the office</Button>
        </>}>
        <Select label="What is it about" value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}>
          {areas.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
        <div className="form-group">
          <label className="form-label required" htmlFor="mydoc-ask">What is wrong, and what should it be</label>
          <textarea id="mydoc-ask" data-text="sentence" className="form-control" rows={4} maxLength={600}
            value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="e.g. My current address has changed to 14 Lake Road, Pune 411001" />
          <span className="form-hint">{600 - form.message.length} characters left. Do not put a full Aadhaar or bank account number here — hand those to the office.</span>
        </div>
      </Modal>
    </section>
  );
}
