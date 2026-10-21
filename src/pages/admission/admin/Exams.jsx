/**
 * Entrance exams and interviews of every round, and the question bank the
 * online exams draw from.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, ResultsChip, Table, Toolbar, SearchBox, Select, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, IconBtn, Note, useLoad,
} from '../admUI';
import { fmtDateTime, errMsg, EXAM_MODE } from '../meta';
import { useAdmission, useQueryState, useDebounced, RoundSelect } from './parts';
import { ExamForm, emptyExam, formToExam, QuestionDialog, QuestionLine, QUESTION_TYPES } from './examParts';

const BASE = '/admin/admissions';
export const EXAM_STATUS = { draft: ['Draft', 'gray'], scheduled: ['Scheduled', 'indigo'], completed: ['Completed', 'green'], cancelled: ['Cancelled', 'red'] };

export default function Exams() {
  const [q, setQ] = useQueryState({ tab: 'exams' });
  const adm = useAdmission();
  const barred = (adm.classes || []).filter((c) => adm.screening?.[c._id]?.banned);
  return (
    <Page>
      <Head eyebrow="Admissions" title="Entrance exams" subtitle="Written exams at the school, online exams on the portal, and interviews." />
      {barred.length ? (
        <Note tone="indigo" icon="shieldCheck">
          No entrance test or interview may choose children for {barred.map((c) => c.className).join(', ')} — the RTE Act allows only a random draw for elementary classes.
          Use a lottery list under <Link to={`${BASE}/selection`}>Selection</Link>. The classes it covers are set under <Link to={`${BASE}/settings?tab=compliance`}>Settings → Compliance</Link>.
        </Note>
      ) : null}
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'exams', label: 'Exams and interviews' }, { key: 'bank', label: 'Question bank' }]} />
      {q.tab === 'bank' ? <Bank /> : <List />}
    </Page>
  );
}

function List() {
  const nav = useNavigate();
  const [q, setQ] = useQueryState({ tab: 'exams', round: '' });
  const { data, loading, error, reload } = useLoad(() => admin.exams({ round: q.round }), [q.round]);
  const [creating, setCreating] = useState(false);
  return (
    <Panel pad={false}>
      <Toolbar>
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v })} />
        <span style={{ flex: 1 }} />
        <Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>New exam or interview</Btn>
      </Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Table rows={data || []} onRow={(r) => nav(`${BASE}/exams/${r._id}`)}
          empty={<Empty icon="clipboard" title="No exams yet" action={<Btn kind="primary" onClick={() => setCreating(true)}>Set one up</Btn>}>Exams belong to an admission round and its classes.</Empty>}
          columns={[
            { key: 'name', label: 'Exam', render: (r) => <><b>{r.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.roundName}</div></> },
            { key: 'mode', label: 'Kind', render: (r) => EXAM_MODE[r.mode] },
            { key: 'when', label: 'When', render: (r) => fmtDateTime(r.startsAt) },
            { key: 'cands', label: 'Candidates', align: 'right', render: (r) => r.candidates },
            { key: 'qs', label: 'Questions', align: 'right', render: (r) => (r.mode === 'online' ? r.questions : '—') },
            { key: 'marks', label: 'Marks', align: 'right', render: (r) => r.maxMarks || '—' },
            { key: 'status', label: 'Status', render: (r) => <Chip tone={EXAM_STATUS[r.status]?.[1]}>{EXAM_STATUS[r.status]?.[0] || r.status}</Chip> },
            { key: 'results', label: 'Results', render: (r) => <ResultsChip status={r.resultsStatus} /> },
          ]} />
      )}
      <CreateExam open={creating} onClose={() => setCreating(false)} round={q.round} onDone={(id) => nav(`${BASE}/exams/${id}`)} />
    </Panel>
  );
}

function CreateExam({ open, onClose, round, onDone }) {
  const [f, setF] = useState(emptyExam(round));
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) setF(emptyExam(round)); }, [open, round]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.createExam(formToExam(f));
      toast.success('Exam created — finish setting it up, then schedule it');
      onClose();
      onDone(r.data._id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="New exam or interview" width={760}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.name.trim() || !f.round || !f.classes.length || !f.startsAt} onClick={go}>Create</Btn></>}>
      <ExamForm f={f} setF={setF} compact />
    </Dialog>
  );
}

/* ── The question bank ────────────────────────────────────────────────────── */

function Bank() {
  const adm = useAdmission(); // eslint-disable-line no-unused-vars
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const term = useDebounced(search);
  const { data, loading, error, reload } = useLoad(() => admin.bank({ q: term, type }), [term, type]);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <Panel pad={false} title="Question bank" sub="Questions kept for reuse. Add them to an online exam from its Questions tab." icon="layers"
      right={<Btn kind="primary" icon="plus" onClick={() => setEdit({})}>Add a question</Btn>}>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search the questions" />
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">Every type</option>
          {QUESTION_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Table rows={data || []} empty={<Empty icon="layers" title="The bank is empty" />}
          columns={[
            { key: 'q', label: 'Question', render: (q) => <QuestionLine q={q} /> },
            { key: 'marks', label: 'Marks', align: 'right', render: (q) => q.marks },
            { key: 'tags', label: 'Tags', render: (q) => <div className="adm-row" style={{ gap: 4 }}>{q.difficulty ? <Chip tone="violet">{q.difficulty}</Chip> : null}{(q.tags || []).map((t) => <Chip key={t}>{t}</Chip>)}</div> },
            { key: 'act', label: '', render: (q) => (
              <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(q)} />
                <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(q)} />
              </div>
            ) },
          ]} />
      )}
      <QuestionDialog open={!!edit} question={edit?._id ? edit : null} onClose={() => setEdit(null)} onDone={reload} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete this question from the bank?" confirmLabel="Delete"
        message="Exams that already copied it keep their copy."
        onConfirm={async () => { try { await admin.deleteQuestion(del._id); toast.success('Deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Panel>
  );
}
