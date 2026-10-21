/**
 * Exports prepared in the background (school-backend services/admission/
 * exportJobs.js): for lists too big to wait for. The office asks, carries on,
 * and downloads the file here when it is ready — for a day, after which it is
 * deleted. Each download is logged as an export of personal data.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import { Btn, Chip, Dialog, Table, Empty, Note, Field, Select, Check, useLoad } from '../admUI';
import { fmtDateTime, errMsg } from '../meta';
import { openFile } from './parts';

const STATUS = { queued: ['Waiting', 'gray'], running: ['Being prepared', 'indigo'], ready: ['Ready', 'green'], failed: ['Failed', 'red'], expired: ['Deleted', 'gray'] };
const KIND = { applications: 'Applications', payments: 'Payments' };

export default function BackgroundExport({ kind, params = {}, label = 'Prepare in the background' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn icon="clock" onClick={() => setOpen(true)}>{label}</Btn>
      {open ? <ExportsDialog kind={kind} params={params} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ExportsDialog({ kind, params, onClose }) {
  const { data, reload } = useLoad(() => admin.exportJobs(), []);
  const [format, setFormat] = useState('xlsx');
  const [answers, setAnswers] = useState(true);
  const [busy, setBusy] = useState(false);
  const working = (data || []).some((x) => ['queued', 'running'].includes(x.status));
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [working, reload]);
  const go = async () => {
    setBusy(true);
    try {
      const { page, limit, ...rest } = params; // eslint-disable-line no-unused-vars
      await admin.queueExport({ kind, format, params: { ...rest, ...(kind === 'applications' ? { answers: answers ? '1' : '0' } : {}) } });
      toast.success('Being prepared — it appears below when ready');
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const download = (x) => openFile(admin.exportFileUrl(x._id), { download: true, filename: `${x.kind}-${String(x.createdAt).slice(0, 10)}.${x.format}` });
  return (
    <Dialog open onClose={onClose} title={`Prepare an export — ${KIND[kind]}`} width={720} footer={<Btn onClick={onClose}>Close</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Note icon="info">Uses the filters on the page. You can close this and come back — files are kept for a day, then deleted.</Note>
        <div className="adm-row" style={{ alignItems: 'flex-end' }}>
          <Field label="As"><Select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: 140 }}><option value="xlsx">Excel</option><option value="csv">CSV</option></Select></Field>
          {kind === 'applications' ? <Check checked={answers} onChange={setAnswers}>With every answer on the form</Check> : null}
          <Btn kind="primary" icon="download" busy={busy} onClick={go}>Prepare</Btn>
        </div>
        <Table dense rows={(data || []).filter((x) => x.kind === kind)} empty={<Empty compact icon="files" title="Nothing prepared yet" />} columns={[
          { key: 'w', label: 'Asked for', render: (x) => <>{fmtDateTime(x.createdAt)}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{x.requestedByName || ''} · {x.format.toUpperCase()}</div></> },
          { key: 'r', label: 'Rows', align: 'right', render: (x) => (x.status === 'ready' || x.status === 'expired' ? x.rows : '—') },
          { key: 's', label: '', render: (x) => <Chip tone={STATUS[x.status]?.[1]} title={x.error || ''}>{STATUS[x.status]?.[0]}</Chip> },
          { key: 'x', label: '', render: (x) => (x.status === 'ready' ? <Btn size="sm" icon="download" onClick={() => download(x)}>Download</Btn>
            : x.status === 'expired' && x.expiresAt ? <span className="adm-muted" style={{ fontSize: '.74rem' }}>Deleted {fmtDateTime(x.expiresAt)}</span> : null) },
        ]} />
      </div>
    </Dialog>
  );
}
