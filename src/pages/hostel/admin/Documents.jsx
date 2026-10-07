/**
 * Hostel → Documents (Sep 2026 redesign, to the user's mockup).
 *
 * The register of admission paperwork, identity proofs, agreements and hostel
 * records, from GET /hostel/admin/board/documents. A document is held by a
 * student, a member of staff (through their hostel post) or the hostel itself —
 * one of the three, so those tabs add up; Expiring Soon cuts across them.
 * Files are read through the scoped download route, never a public link.
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { useNewFromLink } from '../shared';
import { PageHead, Mark, Glyph, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, Ico, useListState, useBoardData, exportCsv, fmtDate, fileSize,
} from './hsList';
import { roomTight } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, StudentPicker, ConfirmDialog } from './hsForm';
import { MoreFilters, stamp } from './hsTags';

const TYPE = {
  admission: ['Admission', 'indigo'], academic: ['Academic', 'sky'], id_proof: ['ID Proof', 'red'], photo: ['Identity', 'pink'],
  medical: ['Medical', 'green'], parent_authorization: ['Consent', 'blue'], undertaking: ['Undertaking', 'violet'],
  agreement: ['Agreement', 'lavender'], fee_receipt: ['Fee Receipt', 'teal'], outpass: ['Outpass', 'amber'],
  incident: ['Incident', 'orange'], complaint: ['Complaint', 'orange'], other: ['Other', 'slate'],
};
const TypeTag = ({ value }) => { const [text, tone] = TYPE[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg">{text}</Badge>; };
const VERIFY = { verified: ['Verified', 'green', 'checkCircle'], pending: ['Pending', 'amber', 'clock'], rejected: ['Rejected', 'red', 'closeCircle'] };
const Verification = ({ value }) => { const [text, tone, icon] = VERIFY[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg" icon={icon}>{text}</Badge>; };
const FILTERS = { hostel: '', type: '', status: '', expiry: '', from: '', to: '', sort: '', dir: '' };
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
const MAX = 5 * 1024 * 1024;
const blank = { holder: 'student', student: '', hostel: '', post: '', title: '', docType: 'other', expiryDate: '', description: '', replaces: null };

const extOf = (r) => (String(r.originalName || r.title || '').match(/\.([a-z0-9]+)$/i)?.[1] || (r.mimeType || '').split('/')[1] || 'file').toUpperCase().replace('JPEG', 'JPG');
const isImage = (r) => /^image\//.test(r.mimeType || '') || /\.(jpe?g|png)$/i.test(r.originalName || r.title || '');
const isPdf = (r) => r.mimeType === 'application/pdf' || /\.pdf$/i.test(r.originalName || r.title || '');
/** The file's own icon: red for a PDF, green for a picture, blue for the rest. */
const FileMark = ({ r, size = 34 }) => (
  <span className={`hs-file hs-file--${isPdf(r) ? 'pdf' : isImage(r) ? 'img' : 'doc'}`} style={{ width: size, height: size }}>
    <Glyph name={isPdf(r) ? 'filePdf' : isImage(r) ? 'fileImg' : 'doc'} size={Math.round(size * 0.72)} />
  </span>
);
const daysTo = (d) => Math.ceil((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
const Expiry = ({ r }) => {
  if (!r.expiryDate) return <span className="hs-muted">–</span>;
  const n = daysTo(r.expiryDate);
  const [text, tone] = r.expiry === 'expired' ? ['Expired', 'red'] : r.expiry === 'expiring' ? [n === 0 ? 'Expires today' : `Expiring in ${n} day${n === 1 ? '' : 's'}`, 'amber'] : ['Valid', 'green'];
  return <span className="hs-stack hs-expiry"><span className="hs-two__top">{fmtDate(r.expiryDate)}</span><Badge tone={tone}>{text}</Badge></span>;
};
const uploader = (r) => (r.uploadedByPost ? words(r.uploadedByPost) : /admin/.test(r.uploaderRole || '') ? 'Admin' : r.uploadedByName || words(r.uploaderRole) || '');
const holderOf = (r) => {
  if (r.holder === 'student') return [r.studentName, [r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo, r.studentClass].filter(Boolean).join(' · ')];
  if (r.holder === 'staff') return [r.staffName || 'Staff member', words(r.staffRole) || 'Staff'];
  return [r.hostelName || 'Hostel', 'Hostel record'];
};
const where = (r) => (r.roomNumber ? roomTight(r).replace('-', ' - ') : '');

/** Save a Blob under a name. */
const save = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function Documents() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS }, { fromUrl: ['status', 'tab', 'search', 'expiry'] });
  const tab = ['student', 'hostel', 'staff', 'expiring'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('documents', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState([]);
  const [drag, setDrag] = useState(false);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [verify, setVerify] = useState(null);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState(false);
  const [settings, setSettings] = useState(null);
  const [remove, setRemove] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const pick = useRef(null);
  const [pickedStudent, setPickedStudent] = useState(null);

  useEffect(() => {
    if (!modal || form.holder !== 'staff' || posts.length) return;
    api.getBoard('staff', { limit: 500 }).then((r) => setPosts(((r.data ?? r).rows || []).filter((x) => x.status !== 'inactive'))).catch(() => setPosts([]));
  }, [modal, form.holder, posts.length]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const takeFile = (f) => {
    if (!f) return false;
    if (f.size > MAX) { toast.error(`${f.name} is larger than 5 MB`); return false; }
    if (!/\.(pdf|jpe?g|png|docx?)$/i.test(f.name)) { toast.error('Only PDF, JPG, PNG or Word files can be uploaded'); return false; }
    setFile(f);
    setForm((x) => ({ ...x, title: x.title || f.name }));
    return true;
  };
  const open = (f, extra = {}) => {
    setForm({ ...blank, ...extra }); setFile(null); setModal(true);
    if (f) takeFile(f);
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) open(f);
  };

  const submit = async () => {
    if (!file) { toast.error('Choose a file to upload'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', form.title || file.name);
      fd.append('docType', form.docType);
      if (form.expiryDate) fd.append('expiryDate', form.expiryDate);
      if (form.description) fd.append('description', form.description);
      if (form.replaces) fd.append('replacesDocument', form.replaces._id);
      else if (form.holder === 'student') {
        fd.append('student', form.student); if (pickedStudent?.allocation?.hostel) fd.append('hostel', pickedStudent.allocation.hostel);
        fd.append('entityType', 'HostelAdmission');
      } else if (form.holder === 'staff') {
        fd.append('entityType', 'HostelStaffAssignment'); fd.append('entityId', form.post);
      } else {
        fd.append('hostel', form.hostel); fd.append('entityType', 'Hostel'); fd.append('entityId', form.hostel);
      }
      await api.uploadDocument(fd);
      toast.success(form.replaces ? 'New version uploaded' : 'Document uploaded');
      setModal(false); reload();
      if (form.replaces && detail?._id === form.replaces._id) setDetail(null);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const download = async (r) => {
    try { save(await api.downloadDocument(r._id), r.originalName || r.title); }
    catch { toast.error('The file could not be downloaded'); }
  };

  const openDetail = async (r) => {
    setDetail(r); setPreview(null);
    if (!isImage(r) && !isPdf(r)) return;
    try {
      const blob = await api.downloadDocument(r._id);
      const typed = blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: isPdf(r) ? 'application/pdf' : 'image/png' });
      setPreview({ id: r._id, url: URL.createObjectURL(typed) });
    } catch { setPreview({ id: r._id, missing: true }); }
  };
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const ask = (r, status) => { setVerify({ r, status }); setRemark(''); };
  const submitVerify = async () => {
    if (verify.status === 'rejected' && !remark.trim()) { toast.error('Say why the document is rejected'); return; }
    setBusy(true);
    try {
      await api.verifyDocument(verify.r._id, { status: verify.status, remark: remark.trim() });
      toast.success(verify.status === 'verified' ? 'Document verified' : verify.status === 'rejected' ? 'Document rejected' : 'Sent back to pending');
      const id = verify.r._id; setVerify(null); reload();
      if (detail?._id === id) setDetail((d) => ({ ...d, verificationStatus: verify.status, verificationRemark: remark.trim(), verifiedAt: new Date().toISOString() }));
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const doRemove = async () => {
    setBusy(true);
    try {
      await api.deleteDocument(remove._id); toast.success('Document removed');
      if (detail?._id === remove._id) setDetail(null);
      setRemove(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openTypes = async () => {
    setTypes(true);
    if (!settings) { try { const r = await api.getSettings(); setSettings(r.data ?? r); } catch { /* the counts still show */ } }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));
  const required = new Set(settings?.requiredAdmissionDocuments || []);

  const columns = [
    { key: 'doc', label: 'Document', render: (r) => (
      <span className="hs-person"><FileMark r={r} /><span className="hs-clip"><TwoLine top={r.title} sub={`${extOf(r)} • ${fileSize(r.fileSize)}${r.version > 1 ? ` • v${r.version}` : ''}`} /></span></span>
    ) },
    { key: 'holder', label: 'Student / Holder', render: (r) => { const [top, sub] = holderOf(r); return <TwoLine top={top} sub={sub} />; } },
    { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={where(r)} /> },
    { key: 'type', label: 'Type', render: (r) => <TypeTag value={r.docType} /> },
    { key: 'up', label: 'Uploaded', render: (r) => <TwoLine top={fmtDate(r.createdAt)} sub={uploader(r) ? `by ${uploader(r)}` : ''} />, nowrap: true },
    { key: 'exp', label: 'Expiry', render: (r) => <Expiry r={r} />, nowrap: true },
    { key: 'ver', label: 'Verification', render: (r) => <Verification value={r.verificationStatus} /> },
  ];

  const csvCols = [
    { label: 'Document', value: (r) => r.title }, { label: 'Type', value: (r) => TYPE[r.docType]?.[0] || words(r.docType) },
    { label: 'Holder', value: (r) => holderOf(r)[0] }, { label: 'Holder detail', value: (r) => holderOf(r)[1] },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => where(r) },
    { label: 'Uploaded', value: (r) => stamp(r.createdAt) }, { label: 'Uploaded by', value: (r) => uploader(r) },
    { label: 'Expiry', value: (r) => (r.expiryDate ? fmtDate(r.expiryDate) : '') }, { label: 'Expiry state', value: (r) => words(r.expiry) },
    { label: 'Verification', value: (r) => words(r.verificationStatus) }, { label: 'Remark', value: (r) => r.verificationRemark },
    { label: 'Size', value: (r) => fileSize(r.fileSize) },
  ];
  const exportAll = async () => {
    try { const res = await api.getBoard('documents', { ...state, page: 1, limit: 5000 }); exportCsv('hostel-documents.csv', csvCols, (res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const steps = (r) => [
    r.verificationStatus !== 'verified' && { label: 'Verify', icon: 'checkCircle', onClick: () => ask(r, 'verified') },
    r.verificationStatus !== 'rejected' && { label: 'Reject', icon: 'closeCircle', onClick: () => ask(r, 'rejected') },
    r.verificationStatus !== 'pending' && { label: 'Mark as pending', icon: 'clock', onClick: () => ask(r, 'pending') },
    '-',
    { label: 'Upload a new version', icon: 'upload', onClick: () => open(null, { replaces: r, title: r.title, docType: r.docType, expiryDate: '' }) },
    { label: 'Remove', icon: 'trash', danger: true, onClick: () => setRemove(r) },
  ].filter(Boolean);

  const attention = (t.pending || 0) + (t.expiring || 0) + (t.expired || 0);

  return (
    <div className="hs-page">
      <PageHead title="Hostel Documents" subtitle="Manage admission paperwork, undertakings, agreements, identity proofs and hostel records.">
        <div className="hs-headstack">
          <div className="hs-headstack__row">
            <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
            <Btn className="hs-btn--accent" icon="fileDoc" onClick={openTypes}>Document Types</Btn>
            <Btn kind="primary" icon="plus" onClick={() => open()}>Upload Document</Btn>
          </div>
          <div className={`hs-drop${drag ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)} onDrop={onDrop}>
            <Ico name="upload" size={26} />
            <span>
              <span>Drop files here or <button type="button" className="hs-linkbtn" onClick={() => pick.current?.click()}>browse</button></span>
              <small>PDF, JPG, PNG (Max 5 MB each)</small>
            </span>
            <input ref={pick} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) open(f); }} />
          </div>
        </div>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="indigo" icon="doc" value={t.total ?? 0} label="Total Documents" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.verified ?? 0} label="Verified" pct={t.verifiedPct ?? 0}
          pctLabel={<>{t.verifiedPct ?? 0}% <span className="hs-muted">of total</span></>} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending Verification" pct={t.pendingPct ?? 0}
          pctLabel={<>{t.pendingPct ?? 0}% <span className="hs-muted">of total</span></>} pctTone="amber" bar barColor="#f79009" />
        <Kpi tone="red" icon="calendarSolid" value={t.expiring ?? 0} label="Expiring Soon" pct={t.expiringPct ?? 0}
          pctLabel={<>{t.expiringPct ?? 0}% <span className="hs-muted">of total</span></>} pctTone="red" bar barColor="#f04438" />
      </Kpis>

      {attention ? (
        <div className="hs-attn" role="status">
          <span className="hs-attn__lead"><Glyph name="alertTri" size={30} /><strong>Attention required</strong></span>
          {t.pending ? <button type="button" className="hs-attn__item" onClick={() => set({ status: 'pending', expiry: '', tab: 'all' })}><b>{t.pending}</b> document{t.pending === 1 ? '' : 's'} pending verification</button> : null}
          {t.expiring ? <button type="button" className="hs-attn__item" onClick={() => set({ tab: 'expiring', status: '', expiry: '' })}><b>{t.expiring}</b> document{t.expiring === 1 ? '' : 's'} expiring within 30 days</button> : null}
          {t.expired ? <button type="button" className="hs-attn__item" onClick={() => set({ expiry: 'expired', status: '', tab: 'all' })}><b>{t.expired}</b> already expired</button> : null}
          <button type="button" className="hs-attn__go" onClick={() => (t.pending ? set({ status: 'pending', expiry: '', tab: 'all' }) : set({ tab: 'expiring', status: '' }))}>
            Review <Ico name="arrowRight" size={16} />
          </button>
        </div>
      ) : null}

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Documents by holder"
        items={[
          { key: 'all', label: 'All Documents', count: tabs.all ?? 0 },
          { key: 'student', label: 'Student Documents', count: tabs.student ?? 0 },
          { key: 'hostel', label: 'Hostel Documents', count: tabs.hostel ?? 0 },
          { key: 'staff', label: 'Staff Documents', count: tabs.staff ?? 0 },
          { key: 'expiring', label: 'Expiring Soon', count: tabs.expiring ?? 0, tone: 'bad' },
        ]} />

      <FilterBar>
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student, document name or ID..." grow={1} width="200px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="128px" />
        <FSelect value={state.type} onChange={(v) => set({ type: v })} all="All document types" options={Object.entries(TYPE).map(([value, [label]]) => ({ value, label }))} grow={0} width="178px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All verification status" options={Object.entries(VERIFY).map(([value, [label]]) => ({ value, label }))} grow={0} width="196px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="236px" />
        <MoreFilters kind="primary" groups={[
          { key: 'expiry', title: 'Expiry', value: state.expiry, onPick: (v) => set({ expiry: v }), options: [['', 'Any'], ['valid', 'Valid'], ['expiring', 'Expiring within 30 days'], ['expired', 'Expired'], ['none', 'No expiry date']] },
          { key: 'sort', title: 'Order', value: state.sort ? `${state.sort}:${state.dir}` : '', onPick: (v) => { const [s, d] = v.split(':'); set({ sort: s || '', dir: d || '' }); },
            options: [['', 'Newest first'], ['created:asc', 'Oldest first'], ['expiry:asc', 'Expiring first'], ['title:asc', 'Name A–Z']] },
        ]} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="document" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="checkCircle" onClick={async () => {
            const list = rows.filter((r) => selected.has(String(r._id)) && r.verificationStatus !== 'verified');
            try {
              for (const r of list) await api.verifyDocument(r._id, { status: 'verified', remark: '' }); // eslint-disable-line no-await-in-loop
              toast.success(`${list.length} document${list.length === 1 ? '' : 's'} verified`); setSelected(new Set()); reload();
            } catch (err) { toast.error(err.message); reload(); }
          }}>Verify</Btn>
          <Btn size="sm" icon="download" onClick={() => exportCsv('hostel-documents.csv', csvCols, rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={6} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Btn size="sm" icon="download" onClick={() => download(r)}>Download</Btn>
              <Kebab label={`Actions for ${r.title}`} items={steps(r)} />
            </>
          )}
          empty={(
            <EmptyRows icon="doc" title={filtered || tab !== 'all' ? 'No document matches' : 'No documents yet'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()}>Upload Document</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Admission paperwork, agreements and hostel records are kept here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'document' : 'documents'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={submit} width={700}
        icon="doc" title={form.replaces ? 'Upload a New Version' : 'Upload Document'}
        subtitle={form.replaces ? `Replaces ${form.replaces.title} (version ${form.replaces.version || 1}); the old file is kept in the history.` : 'Add a document to the register — for a student, the hostel or a member of staff.'}
        submitLabel="Upload Document" submitIcon="upload">
        <FormSection>
          <div className="hsf-fld">
            <span className="hsf-fld__label">File<i className="hsf-req" aria-hidden> *</i></span>
            <button type="button" className={`hsf-drop${drag ? ' is-over' : ''}`} onClick={() => pick.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); takeFile(e.dataTransfer?.files?.[0]); }}>
              <Glyph name={file ? 'fileImg' : 'oCloud'} size={26} />
              <span>
                {file ? <span><b>{file.name}</b> · {fileSize(file.size)}</span> : <span><b>Click to upload</b> or drag and drop a file</span>}
                <small>{file ? 'Click to choose another file' : 'PDF, JPG, PNG or Word — up to 5 MB'}</small>
              </span>
            </button>
          </div>
          {form.replaces ? null : (
            <RadioCards label="Belongs To" required cols={3} value={form.holder} onChange={(v) => setF('holder', v)}
              options={[['student', 'A student'], ['hostel', 'The hostel'], ['staff', 'A staff member']]} />
          )}
          {!form.replaces && form.holder === 'student' ? (
            <Fld label="Student" required hint="Only current residents are listed">
              <StudentPicker value={form.student} onChange={(id, st) => { setF('student', id); setPickedStudent(st || null); }} params={{ allocated: 'true' }} />
            </Fld>
          ) : null}
          {!form.replaces && form.holder === 'hostel' ? (
            <Fld label="Hostel" required icon="oBuilding">
              <select value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
          ) : null}
          {!form.replaces && form.holder === 'staff' ? (
            <Fld label="Staff Member" required icon="user">
              <select value={form.post} onChange={(e) => setF('post', e.target.value)}>
                <option value="">Select a member of staff</option>
                {posts.map((x) => <option key={x._id} value={x._id}>{[x.staffName, words(x.role), x.hostelName].filter(Boolean).join(' · ')}</option>)}
              </select>
            </Fld>
          ) : null}
          <Grid cols={2}>
            <Fld label="Name" required icon="doc"><input data-text="title" value={form.title} maxLength={120} onChange={(e) => setF('title', e.target.value)} /></Fld>
            <Fld label="Type" required icon="oTag">
              <select value={form.docType} onChange={(e) => setF('docType', e.target.value)}>
                {Object.entries(TYPE).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
            <Fld label="Expires On" optional icon="calendar" hint="Leave empty for a document that does not expire"><input type="date" value={form.expiryDate} onChange={(e) => setF('expiryDate', e.target.value)} /></Fld>
            <Fld label="Note" optional icon="fileDoc"><input value={form.description} maxLength={200} onChange={(e) => setF('description', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
      </FormModal>

      {/* ── Detail, with the file itself ───────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Document details">
        {detail ? (
          <>
            <DrawerHead mark={<FileMark r={detail} size={52} />} name={detail.title}
              sub={`${extOf(detail)} • ${fileSize(detail.fileSize)}${detail.version > 1 ? ` • version ${detail.version}` : ''}`}
              tags={<><TypeTag value={detail.docType} /><Verification value={detail.verificationStatus} />{detail.expiry === 'expired' ? <Badge tone="red" size="lg">Expired</Badge> : null}</>}
              onClose={() => setDetail(null)} />
            <DrawerBody>
              {isImage(detail) || isPdf(detail) ? (
                <div className="hs-preview">
                  {preview?.id === detail._id && preview.url ? (
                    isImage(detail) ? <img src={preview.url} alt={detail.title} /> : <iframe src={preview.url} title={detail.title} />
                  ) : <p className="hs-muted">{preview?.missing ? 'The stored file could not be opened.' : 'Loading the file…'}</p>}
                </div>
              ) : null}
              <DrawerSection title="Document">
                {detail.description ? <p className="hs-dtext">{detail.description}</p> : null}
                <DrawerFields fields={[
                  ['Belongs to', holderOf(detail).filter(Boolean).join(' · ')], ['Hostel', [detail.hostelName, where(detail)].filter(Boolean).join(' · ')],
                  ['Uploaded', [stamp(detail.createdAt), uploader(detail) ? `by ${uploader(detail)}` : ''].filter(Boolean).join(' ')],
                  ['Expires', detail.expiryDate ? fmtDate(detail.expiryDate) : 'Does not expire'],
                  ['Verification', words(detail.verificationStatus)], ['Checked on', detail.verificationStatus !== 'pending' ? stamp(detail.verifiedAt) : ''],
                  ['Remark', detail.verificationRemark],
                ]} />
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              <Kebab label="More steps" items={[{ label: 'Download', icon: 'download', onClick: () => download(detail) }, ...steps(detail).filter((x) => x === '-' || !['Verify', 'Reject'].includes(x.label))]} />
              {detail.verificationStatus !== 'rejected' ? <Btn icon="closeCircle" onClick={() => ask(detail, 'rejected')}>Reject</Btn> : null}
              {detail.verificationStatus !== 'verified' ? <Btn kind="primary" icon="checkCircle" onClick={() => ask(detail, 'verified')}>Verify</Btn> : null}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      {/* ── Verify / reject ────────────────────────────────────────────────── */}
      <FormModal open={!!verify} onClose={() => setVerify(null)} busy={busy} onSubmit={submitVerify} width={520}
        icon={verify?.status === 'verified' ? 'checkCircle' : verify?.status === 'rejected' ? 'closeCircle' : 'clockSolid'}
        iconTone={verify?.status === 'verified' ? 'green' : verify?.status === 'rejected' ? 'red' : 'amber'}
        title={verify ? (verify.status === 'verified' ? 'Verify Document' : verify.status === 'rejected' ? 'Reject Document' : 'Mark as Pending') : ''}
        subtitle={verify?.r.title} submitLabel={verify ? (verify.status === 'verified' ? 'Verify' : verify.status === 'rejected' ? 'Reject' : 'Mark as Pending') : 'Confirm'}
        tone={verify?.status === 'rejected' ? 'danger' : undefined}>
        {verify ? (
          <FormSection>
            <Fld label={verify.status === 'rejected' ? 'Why Is It Rejected?' : 'Remark'} required={verify.status === 'rejected'} optional={verify.status !== 'rejected'} count={[remark.length, 300]}>
              <textarea rows={3} maxLength={300} value={remark} placeholder={verify.status === 'rejected' ? 'Blurred scan, wrong document, expired…' : ''} onChange={(e) => setRemark(e.target.value)} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} onConfirm={doRemove} busy={busy} title="Remove Document" confirmLabel="Remove" icon="trash"
        message={remove ? `${remove.title} leaves the register. The file and its history are kept for the audit trail.` : ''} />

      {/* ── Document types ─────────────────────────────────────────────────── */}
      <Drawer open={types} onClose={() => setTypes(false)} label="Document types">
        <DrawerHead mark={<Mark name="doc" tone="indigo" size={52} glyph={26} />} name="Document Types" sub="What the register holds, by type" onClose={() => setTypes(false)} />
        <DrawerBody>
          <ul className="hs-typelist">
            {Object.entries(TYPE).map(([k]) => {
              const c = (t.byType || []).find((x) => x.type === k);
              return (
                <li key={k}>
                  <TypeTag value={k} />
                  <span>{required.has(k) ? <small className="hs-pt-red">Required at admission</small> : null}</span>
                  <button type="button" className="hs-linkbtn" disabled={!c} onClick={() => { set({ type: k, tab: 'all' }); setTypes(false); }}>
                    {c ? `${c.n} document${c.n === 1 ? '' : 's'}` : 'None'}{c?.pending ? ` · ${c.pending} pending` : ''}
                  </button>
                </li>
              );
            })}
          </ul>
          {settings ? <p className="hs-muted">Required admission documents are set under Hostel Settings → Admission.</p> : null}
        </DrawerBody>
      </Drawer>
    </div>
  );
}
