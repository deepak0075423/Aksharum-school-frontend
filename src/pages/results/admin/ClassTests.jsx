/**
 * Admin → Results → Class Tests (Oct 2026). Every class test in the school —
 * until now the office could see none of them: not to answer a parent, not to
 * notice a section whose tests nobody approves, not to chase marks never
 * submitted (school-backend services/classTestBoard).
 *
 * Tabs by what a test is waiting for; filters by year, class and subject; a
 * search over the title, topic, teacher and class. A test opens as its marks
 * sheet, read-only. One waiting for approval can be approved, or sent back
 * with a reason, by the office — the class teacher's step, for when the
 * section has none or they are away. The teacher who set it is told either way.
 *
 * Since Oct 2026 the office may also hand a test to another teacher of the
 * subject in that section (its teacher left, or is away), and delete a test set
 * by mistake — never one whose marks were approved, which stays on record.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import {
  PageHead, Tiles, Tile, Btn, IconBtn, LineTabs, SearchBox, SelectField, Badge, Pager, Empty, Ico,
  useBoard, useDebounced, count, plural, fmtDay,
} from '../rsUI';
import { classLine } from '../resultMeta';
import MarksSheet from '../MarksSheet';

const TABS = [
  { key: 'all', label: 'All Tests' },
  { key: 'waiting', label: 'Waiting for Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'open', label: 'Being Marked' },
  { key: 'rejected', label: 'Sent Back' },
];
const TONE = { DRAFT: 'slate', SUBMITTED: 'blue', FINAL_APPROVED: 'green', REJECTED: 'red', REOPENED: 'amber' };
const NONE = { academicYear: '', classNumber: '', subject: '' };

/** A test sent back to its teacher, with the reason they will read. */
function SendBack({ test, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setReason(''); setError(''); setBusy(false); }, [test]);
  if (!test) return null;
  const send = async () => {
    if (!reason.trim()) { setError('Say what needs correcting — the teacher will see it'); return; }
    setBusy(true);
    try {
      await api.rejectClassTestAsOffice(test._id, { reason: reason.trim() });
      toast.success(`Sent back to ${test.setBy || 'the teacher'} to correct`);
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={500}
      title={<span className="rs-ask__title rs-t-red"><i><Ico name="undo" size={18} /></i><span>Send back {test.title}<small>{[test.subjectName, classLine(test)].filter(Boolean).join(' · ')}</small></span></span>}
      footer={(
        <span className="rs-form__foot">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="danger-solid" busy={busy} onClick={send}>Send Back</Btn>
        </span>
      )}>
      <div className="rs-ask">
        <p>{test.setBy || 'The teacher'} will see your reason, reopen the test and submit the marks again.</p>
        <label className="rs-ask__reason">
          <span>What needs correcting <b aria-hidden>*</b></span>
          <textarea rows={3} maxLength={500} value={reason} autoFocus onChange={(e) => { setReason(e.target.value); setError(''); }} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

/** A test handed to another teacher of its subject in the section. */
function HandOver({ test, onClose, onDone }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setTo(test?.others?.length === 1 ? test.others[0]._id : ''); setError(''); setBusy(false); }, [test]);
  if (!test) return null;
  const go = async () => {
    if (!to) { setError('Choose the teacher'); return; }
    setBusy(true);
    try {
      await api.handOverClassTest(test._id, { teacherId: to });
      toast.success(`Handed to ${test.others.find((x) => x._id === to)?.name || 'the teacher'} — they have been told`);
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={480}
      title={<span className="rs-ask__title rs-t-indigo"><i><Ico name="userPlus" size={18} /></i><span>Hand over {test.title}<small>{[test.subjectName, classLine(test)].filter(Boolean).join(' · ')}</small></span></span>}
      footer={(
        <span className="rs-form__foot">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" busy={busy} onClick={go}>Hand Over</Btn>
        </span>
      )}>
      <div className="rs-ask">
        <p>The test becomes theirs: they enter and submit its marks{test.status === 'FINAL_APPROVED' ? ', and reopen it if a mark needs correcting' : ''}. {test.setBy || 'Its teacher'} no longer sees it as their own.</p>
        <div className="rs-correct">
          <label><span>Hand to</span>
            <select value={to} onChange={(e) => { setTo(e.target.value); setError(''); }}>
              <option value="">Choose…</option>
              {test.others.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

/** A test set by mistake, deleted. */
function Remove({ test, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); setBusy(false); }, [test]);
  if (!test) return null;
  const go = async () => {
    setBusy(true);
    try {
      await api.deleteClassTestAsOffice(test._id);
      toast.success('Class test deleted');
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={460}
      title={<span className="rs-ask__title rs-t-red"><i><Ico name="trash" size={18} /></i><span>Delete {test.title}</span></span>}
      footer={(
        <span className="rs-form__foot">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="danger-solid" busy={busy} onClick={go}>Delete Test</Btn>
        </span>
      )}>
      <div className="rs-ask">
        <p>Delete the class test <strong>{test.title}</strong> ({[test.subjectName, classLine(test)].filter(Boolean).join(', ')}){test.entered ? `, with the ${plural(test.entered, 'mark')} entered on it` : ''}? This cannot be undone. Its marks were never approved, so no family has seen them.</p>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function ClassTests() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Class Tests' }]);
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState(NONE);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [open, setOpen] = useState(null);         // the test whose sheet is open
  const [sendBack, setSendBack] = useState(null);
  const [handOver, setHandOver] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [approving, setApproving] = useState(false);

  const q = useDebounced(search, 300).trim();
  const query = useMemo(() => {
    const out = { tab, page, limit };
    if (q) out.search = q;
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') out[k] = v; });
    return out;
  }, [tab, page, limit, q, filters]);
  const { body, loading, error, reload } = useBoard(api.getClassTestsAsOffice, query);
  const rows = body?.data || [];
  const tabs = body?.tabs || {};
  const f = body?.filters || { years: [], classes: [], subjects: [] };
  const setFilter = (k, v) => { setFilters((s) => ({ ...s, [k]: v })); setPage(1); };
  const narrowed = !!q || Object.values(filters).some((v) => v !== '');

  const approve = async (test) => {
    setApproving(true);
    try {
      await api.approveClassTestAsOffice(test._id, {});
      toast.success('Approved — students can see their marks now');
      setOpen(null); reload();
    } catch (e) { toast.error(e.message); } finally { setApproving(false); }
  };

  return (
    <div className="rs-page">
      <PageHead title="Class Tests" subtitle="Every class test in the school: what is waiting for approval, what is still being marked, and what families can see.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
      </PageHead>

      <Tiles>
        <Tile tone="indigo" icon="clipboard" iconSize={32} value={tabs.all ?? 0} label="Class Tests" quietLabel caption="Set by teachers" onClick={() => { setTab('all'); setPage(1); }} on={tab === 'all'} />
        <Tile tone="blue" icon="clockRing" iconSize={35} value={tabs.waiting ?? 0} label="Waiting for Approval" caption="By the class teacher" onClick={() => { setTab('waiting'); setPage(1); }} on={tab === 'waiting'} />
        <Tile tone="green" icon="checkDisc" value={tabs.approved ?? 0} label="Approved" caption="Families can see the marks" onClick={() => { setTab('approved'); setPage(1); }} on={tab === 'approved'} />
        <Tile tone="amber" icon="pencil" iconSize={30} value={(tabs.open ?? 0) + (tabs.rejected ?? 0)} label="Being Marked" caption={tabs.rejected ? `${tabs.rejected} sent back` : 'Marks still going in'} onClick={() => { setTab('open'); setPage(1); }} on={tab === 'open'} />
      </Tiles>

      <section className="rs-card" aria-label="Class tests">
        <div className="rs-card__top">
          <LineTabs value={tab} onChange={(k) => { setTab(k); setPage(1); }} label="Class tests by stage" items={TABS.map((t) => ({ ...t, count: tabs[t.key] }))} />
          <div className="rs-tools">
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by test, topic, teacher or class..." label="Search class tests" />
          </div>
        </div>
        <div className="rs-filters">
          <SelectField label="Academic Year" width={192} value={filters.academicYear} onChange={(v) => setFilter('academicYear', v)} all="All Years"
            options={f.years.map((y) => ({ value: y._id, label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
          <SelectField label="Class" width={180} value={filters.classNumber} onChange={(v) => setFilter('classNumber', v)} all="All Classes"
            options={f.classes.map((c) => ({ value: String(c.classNumber), label: c.className }))} />
          <SelectField label="Subject" width={200} value={filters.subject} onChange={(v) => setFilter('subject', v)} all="All Subjects"
            options={f.subjects.map((x) => ({ value: x._id, label: x.subjectName }))} />
          <Btn className="rs-filters__reset" icon="reset" iconSize={19} onClick={() => { setFilters(NONE); setSearch(''); setPage(1); }}>Reset</Btn>
        </div>

        <div className="rs-tablearea">
          <div className={`rs-tablebox${loading && body ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
            <div className="rs-tablescroll">
              <table className={`rs-table ${rows.length ? 'rs-table--rows' : 'rs-table--empty'}`}>
                <thead>
                  <tr><th>Test</th><th>Class / Section</th><th>Subject</th><th>Set By</th><th>Date</th><th>Marks</th><th>Average</th><th>Status</th><th className="is-right rs-table__acts">Actions</th></tr>
                </thead>
                {rows.length ? (
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <button type="button" className="rs-name" onClick={() => setOpen(r)}>
                            <strong>{r.title}</strong>
                            <span className="rs-sub">{[r.topic, `Max ${r.maxMarks} · pass ${r.passingMarks}`].filter(Boolean).join(' · ')}</span>
                          </button>
                        </td>
                        <td data-label="Class / Section">{classLine(r)}<span className="rs-sub rs-yearsub">{r.yearName}</span></td>
                        <td data-label="Subject">{r.subjectName}</td>
                        <td data-label="Set by">{r.setBy || <span className="rs-muted">—</span>}</td>
                        <td data-label="Date">{fmtDay(r.testDate)}</td>
                        <td className="rs-num" data-label="Marks">{r.entered} / {r.roll}</td>
                        <td className="rs-num" data-label="Average">{r.average !== null && r.average !== undefined ? `${Math.round(r.average * 10) / 10} / ${r.maxMarks}` : <span className="rs-muted">—</span>}</td>
                        <td data-label="Status">
                          <Badge tone={TONE[r.status] || 'slate'}>{r.statusLabel}</Badge>
                          {r.status === 'SUBMITTED' && !r.hasValidator ? <span className="rs-need" title="This section has no class teacher to approve it">No class teacher</span> : null}
                          {r.status === 'REJECTED' && r.rejectionReason ? (
                            <span className="rs-need rs-need--red" title={r.rejectionReason}>“{r.rejectionReason.length > 36 ? `${r.rejectionReason.slice(0, 35)}…` : r.rejectionReason}”</span>
                          ) : null}
                        </td>
                        <td className="is-right rs-table__acts">
                          <span className="rs-acts">
                            {r.can.review ? <IconBtn icon="checkCircle" className="rs-ibtn--soft" label={`Review ${r.title}`} onClick={() => setOpen(r)} /> : null}
                            <IconBtn icon="eye" label={`View ${r.title}`} onClick={() => setOpen(r)} />
                            {r.can.handOver ? <IconBtn icon="userPlus" label={`Hand ${r.title} to another teacher`} onClick={() => setHandOver(r)} /> : null}
                            {r.can.delete ? <IconBtn icon="trash" label={`Delete ${r.title}`} onClick={() => setRemoving(r)} /> : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ) : null}
              </table>
            </div>
            {rows.length ? null : !body && loading ? <div className="rs-loading" role="status">Loading class tests…</div>
              : error && !body ? <Empty title="Class tests could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
                : (
                  <Empty title="No class tests found">
                    {narrowed ? 'Nothing matches this search or these filters.' : tab === 'waiting' ? 'Nothing is waiting for approval.' : 'Teachers set class tests from their Results page; they appear here as they are set.'}
                  </Empty>
                )}
          </div>
          {rows.length ? (
            <Pager page={body?.page || 1} pages={body?.pages || 1} total={body?.total || 0} limit={limit} noun="class test"
              onPage={setPage} sizes={[20, 50, 100]} onLimit={(n) => { setLimit(n); setPage(1); }} />
          ) : null}
        </div>
      </section>

      <MarksSheet open={!!open} sheetKey={open ? `ct:${open._id}` : 'none'} onClose={() => setOpen(null)}
        load={() => api.getClassTestSheetAsOffice(open._id)} save={async () => {}}
        lockedText={open?.status === 'SUBMITTED'
          ? `Waiting for the class teacher to approve. You can approve these marks, or send them back to ${open?.setBy || 'the teacher'} with a reason.`
          : open?.status === 'FINAL_APPROVED' ? `Approved${open?.approvedBy ? ` by ${open.approvedBy}` : ''} — students and parents can see these marks.`
            : 'This test is with its teacher. The marks can be read here, and are changed by the teacher who set it.'}
        actions={open?.status === 'SUBMITTED' ? (
          <>
            <Btn kind="danger" icon="undo" onClick={() => { setSendBack(open); setOpen(null); }}>Send Back…</Btn>
            <Btn kind="primary" icon="checkCircle" busy={approving} onClick={() => approve(open)}>Approve</Btn>
          </>
        ) : null} />
      <SendBack test={sendBack} onClose={() => setSendBack(null)} onDone={() => { setSendBack(null); reload(); }} />
      <HandOver test={handOver} onClose={() => setHandOver(null)} onDone={() => { setHandOver(null); reload(); }} />
      <Remove test={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); reload(); }} />
    </div>
  );
}
