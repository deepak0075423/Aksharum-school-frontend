/**
 * Admissions → RTE seats (Oct 2026): the 25% the RTE Act (s.12(1)(c)) sets
 * aside in private unaided schools for children from economically weaker
 * sections and disadvantaged groups — allotted by the state, not chosen by
 * the school.
 *
 *   Allotment   load the state's list (CSV) into a class's RTE quota: each
 *               child becomes an application already selected, with the state's
 *               reference. A list loaded twice adds nothing.
 *   Register    what the state owes for each RTE child admitted, year by year:
 *               claimed, received, outstanding.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, Table, Select, Empty, ErrorBox, Spin, Dialog, Field, Input, TextArea, Note, Tiles, Tile, useLoad,
} from '../admUI';
import { fmtDate, errMsg, money } from '../meta';
import { useAdmission, useQueryState, RoundSelect, openFile } from './parts';

const COLUMNS = ['externalRef', 'studentName', 'studentDob', 'studentGender', 'parentName', 'parentPhone', 'parentEmail', 'relation', 'category'];
const HEADINGS = { externalRef: 'State application number', studentName: 'Child', studentDob: 'Date of birth', studentGender: 'Gender', parentName: 'Parent', parentPhone: 'Mobile', parentEmail: 'Email', relation: 'Relation', category: 'Category' };

/** A small CSV reader: commas, quoted fields with "" inside, a header row naming the columns. */
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.replace(/\s+/g, '').toLowerCase());
  const at = (name) => head.indexOf(name.toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, at(c) >= 0 ? r[at(c)] || '' : ''])));
}

export default function Rte() {
  const [q, setQ] = useQueryState({ tab: 'allotment' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="RTE seats" subtitle="The 25% set aside under the RTE Act — allotted by the state, admitted free, reimbursed by the state." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'allotment', label: 'The state\'s allotment' }, { key: 'register', label: 'Reimbursement register' }]} />
      {q.tab === 'register' ? <Register /> : <Allotment />}
    </Page>
  );
}

function Allotment() {
  const adm = useAdmission();
  const [round, setRound] = useState('');
  const [cls, setCls] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const r = adm.roundOf(round);
  const rteClasses = (r?.classes || []).filter((c) => (c.quotas || []).some((x) => x.kind === 'rte'));
  const quota = rteClasses.find((c) => String(c.class) === cls)?.quotas?.find((x) => x.kind === 'rte');
  const rows = useMemo(() => parseCsv(text), [text]);
  const template = () => {
    const csv = `${COLUMNS.join(',')}\nMH-RTE-2027-0001,Esha Pawar,2021-02-02,Female,Gita Pawar,9822000001,gita@example.com,Mother,EWS\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'rte-allotment-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const go = async () => {
    setBusy(true);
    try {
      const res = await admin.importRte(round, { class: cls, quota: quota.key, rows });
      toast.success(`${res.data.imported} child(ren) added${res.data.skipped ? `, ${res.data.skipped} already in` : ''}`);
      setText('');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Note tone="indigo" icon="info">
        The state runs the lottery for these seats and sends the school its list. Each child you load becomes an application already selected under the class&rsquo;s RTE quota, with the state&rsquo;s reference.
        Then check their documents, make each an offer (it is free) and confirm as usual. Set the quota up on the round first (Rounds → a class → Quotas → RTE 25%).
      </Note>
      <Panel title="Load an allotment" icon="upload">
        <div className="adm-grid3">
          <Field label="Round" required><RoundSelect value={round} all="Choose a round" onChange={(v) => { setRound(v); setCls(''); }} /></Field>
          <Field label="Class" required hint={round && !rteClasses.length ? 'No class of this round has an RTE quota yet' : ''}>
            <Select value={cls} onChange={(e) => setCls(e.target.value)} disabled={!rteClasses.length}>
              <option value="">Choose a class</option>
              {rteClasses.map((c) => <option key={c.class} value={c.class}>{adm.className(c.class)}</option>)}
            </Select>
          </Field>
          <Field label="Quota">{quota ? <Chip tone="indigo">{quota.name} — {quota.seats} seats</Chip> : <span className="adm-muted">—</span>}</Field>
        </div>
        <Field label="The list, as CSV" hint={`Columns: ${COLUMNS.join(', ')}. Dates as YYYY-MM-DD; mobile numbers of 10 digits.`} className="adm-mt">
          <TextArea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={COLUMNS.join(',')} />
        </Field>
        <div className="adm-row adm-mt">
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            Open a CSV file…
            <input type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); e.target.value = ''; }} />
          </label>
          <Btn size="sm" kind="ghost" icon="download" onClick={template}>Template</Btn>
          <span style={{ flex: 1 }} />
          <Btn kind="primary" icon="upload" busy={busy} disabled={!quota || !rows.length} onClick={go}>Load {rows.length || ''} {rows.length === 1 ? 'child' : 'children'}</Btn>
        </div>
      </Panel>
      {rows.length ? (
        <Panel title={`Preview — ${rows.length} row(s)`} icon="list" pad={false}>
          <Table dense rows={rows.map((x, i) => ({ ...x, _id: String(i) }))}
            columns={COLUMNS.map((c) => ({ key: c, label: HEADINGS[c], render: (x) => x[c] || <span className="adm-muted">—</span> }))} />
        </Panel>
      ) : null}
    </>
  );
}

const CLAIM = { pending: ['Not claimed yet', 'gray'], claimed: ['Claimed', 'amber'], received: ['Received', 'green'], rejected: ['Rejected', 'red'] };

function Register() {
  const adm = useAdmission();
  const [year, setYear] = useState(String(adm.currentYear?._id || adm.academicYears?.[0]?._id || ''));
  const { data, loading, error, reload } = useLoad(() => (year ? admin.rteRegister(year) : Promise.resolve({ data: null })), [year]);
  const [row, setRow] = useState(null);
  return (
    <>
      <div className="adm-row">
        <Select value={year} onChange={(e) => setYear(e.target.value)} style={{ maxWidth: 220 }} aria-label="Academic year">
          {(adm.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </Select>
        <span style={{ flex: 1 }} />
        <Btn icon="download" disabled={!year} onClick={() => openFile(admin.rteRegisterCsvUrl(year), { download: true, filename: 'rte-reimbursement-register.csv' })}>CSV</Btn>
      </div>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : data ? (
        <>
          <Tiles cols={4}>
            <Tile icon="users" tone="indigo" label="RTE children admitted" value={data.totals.children} />
            <Tile icon="send" tone="amber" label="Claimed" value={money(data.totals.claimed)} />
            <Tile icon="checkCircle" tone="green" label="Received" value={money(data.totals.received)} />
            <Tile icon="clock" tone="red" label="Still owed" value={money(data.totals.outstanding)} />
          </Tiles>
          <Panel pad={false}>
            <Table rows={data.rows} onRow={(r) => setRow(r)}
              empty={<Empty icon="gradCap" title="No RTE children enrolled for this year">A line appears for each child admitted under an RTE quota once they are enrolled.</Empty>}
              columns={[
                { key: 'n', label: 'Student', render: (r) => <><b>{r.studentName}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.admissionNumber} · {r.className}</div></> },
                { key: 'p', label: 'Per child', align: 'right', render: (r) => (r.perChildAmount != null ? money(r.perChildAmount) : '—') },
                { key: 'c', label: 'Claimed', align: 'right', render: (r) => (r.claimedAmount != null ? <>{money(r.claimedAmount)}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{fmtDate(r.claimedAt)}</div></> : '—') },
                { key: 'r', label: 'Received', align: 'right', render: (r) => (r.receivedAmount != null ? <>{money(r.receivedAmount)}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{fmtDate(r.receivedAt)}</div></> : '—') },
                { key: 's', label: 'Status', render: (r) => <Chip tone={CLAIM[r.status]?.[1]}>{CLAIM[r.status]?.[0]}</Chip> },
                { key: 'ref', label: 'Reference', render: (r) => r.reference || '—' },
              ]} />
          </Panel>
        </>
      ) : null}
      <ClaimDialog row={row} onClose={() => setRow(null)} onDone={() => { setRow(null); reload(); }} />
    </>
  );
}

function ClaimDialog({ row, onClose, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (row) setF({ perChildAmount: row.perChildAmount ?? '', claimedAmount: row.claimedAmount ?? '', receivedAmount: row.receivedAmount ?? '', status: row.status, reference: row.reference || '', notes: row.notes || '' });
  }, [row]);
  if (!row) return null;
  const save = async () => {
    setBusy(true);
    try { await admin.updateRteClaim(row._id, f); toast.success('Saved'); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!row} onClose={onClose} title={`${row.studentName} — ${row.admissionNumber}`} width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></>}>
      <div className="adm-grid2">
        <Field label="Per-child amount (₹)" hint="As the state notified it"><Input type="number" min="0" step="1" value={f.perChildAmount} onChange={(e) => setF({ ...f, perChildAmount: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(CLAIM).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Claimed (₹)"><Input type="number" min="0" step="1" value={f.claimedAmount} onChange={(e) => setF({ ...f, claimedAmount: e.target.value })} /></Field>
        <Field label="Received (₹)"><Input type="number" min="0" step="1" value={f.receivedAmount} onChange={(e) => setF({ ...f, receivedAmount: e.target.value })} /></Field>
        <Field label="Reference" hint="The claim or payment number"><Input data-text="code" value={f.reference} maxLength={80} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Notes"><Input value={f.notes} maxLength={500} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
