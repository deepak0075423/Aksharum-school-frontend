import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Button, Modal, Confirm, Spinner, Badge } from '../../components/ui/index';
import ImportYearStructureModal from '../../components/ImportYearStructureModal';

const TYPE_LABEL = { theory: 'Theory', practical: 'Practical', elective: 'Elective' };
const TYPE_VARIANT = { theory: 'primary', practical: 'success', elective: 'warning' };

const EMPTY = { name: '', code: '', type: 'theory', teachers: [] };

export default function Subjects() {
  // A subject belongs to the SCHOOL, not to a year — every year shares one
  // "Hindi". What changes year to year is where a subject is USED, so the year
  // picker does not filter the catalogue: it decides what counts as in use.
  const [selectedYear, setSelectedYear] = useState('');
  const [usageFilter, setUsageFilter]   = useState('all');   // all | inUse | unused
  // Same import as on Academic Years, launched from here because this is the
  // page where "nothing is set up for this year" is actually visible.
  const [importOpen, setImportOpen]     = useState(false);

  const { data: years } = useFetch(api.getAcademicYears);
  useEffect(() => {
    if (!years?.length) return;
    const active = years.find((y) => y.status === 'active');
    setSelectedYear(active?._id || years[0]._id);
  }, [years]);

  const { data: subjects, meta, loading, refetch } = useFetch(
    () => api.getSubjects(selectedYear ? { academicYear: selectedYear } : {}),
    [selectedYear],
  );
  const [modal, setModal]     = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [delLoad, setDL]      = useState(false);
  const [form, setForm]       = useState(EMPTY);
  const [teachers, setTeachers] = useState([]);
  const [teachLoad, setTL]    = useState(false);
  const [teachQuery, setTeachQuery] = useState('');

  // Load teachers once for the modal
  useEffect(() => {
    if (!modal) return;
    if (teachers.length) return;
    setTL(true);
    api.getTeachers({ limit: 200, status: 'active' })
      .then(res => setTeachers(res?.data?.data || res?.data || []))
      .catch(() => {})
      .finally(() => setTL(false));
  }, [modal]);

  const openCreate = () => { setForm(EMPTY); setEditSub(null); setTeachQuery(''); setModal(true); };
  const openEdit   = (r) => {
    setForm({
      name:     r.subjectName,
      code:     r.subjectCode || '',
      type:     r.type || 'theory',
      teachers: (r.teachers || []).map(t => t._id || t),
    });
    setEditSub(r);
    setTeachQuery('');
    setModal(true);
  };

  const toggleTeacher = (id) => {
    setForm(f => ({
      ...f,
      teachers: f.teachers.includes(id)
        ? f.teachers.filter(t => t !== id)
        : [...f.teachers, id],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Subject name is required'); return; }
    setSaving(true);
    try {
      if (editSub) {
        await api.updateSubject(editSub._id, form);
        toast.success('Subject updated');
      } else {
        // Created INTO the year the screen is showing, not the active one.
        await api.createSubject({ ...form, academicYear: selectedYear || undefined });
        toast.success('Subject created');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteSubject(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  // Filtering on the same four fields the row shows, so anything a reader can
  // see they can also type. A selected teacher always stays visible — filtering
  // one out of the list would hide a tick the admin has already made.
  const teachNeedle = teachQuery.trim().toLowerCase();
  const shownTeachers = !teachNeedle ? teachers : teachers.filter(t =>
    form.teachers.includes(t._id) ||
    [t.name, t.email, t.department, t.designation, t.employeeId]
      .some(v => String(v || '').toLowerCase().includes(teachNeedle)));

  // Only meaningful once a year is chosen and the server has attached usage.
  const shown = (subjects || []).filter((r) => {
    if (usageFilter === 'all' || !r.usage) return true;
    return usageFilter === 'inUse' ? r.usage.inUse : !r.usage.inUse;
  });
  const yearName = meta?.academicYear?.yearName || 'this year';

  const columns = [
    { key: 'subjectName', label: 'Name', render: r => <strong>{r.subjectName}</strong> },
    { key: 'subjectCode', label: 'Code', render: r => r.subjectCode || '—' },
    { key: 'type',        label: 'Type', render: r => (
      <Badge variant={TYPE_VARIANT[r.type] || 'muted'}>{TYPE_LABEL[r.type] || r.type || '—'}</Badge>
    )},
    { key: 'teachers', label: 'Teachers', render: r => {
      const ts = r.teachers || [];
      if (!ts.length) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ts.map(t => (
            // The chip stays a name; hovering says which one, for the rows
            // where a school has two of them.
            <span key={t._id || t}
              title={[t.name, t.email, t.department, t.designation].filter(Boolean).join(' · ') || undefined}
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 8px', fontSize: '.78rem',
              }}>{t.name || t}</span>
          ))}
        </div>
      );
    }},
    { key: 'usage', label: `Used in ${yearName}`, render: r => {
      if (!r.usage) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      if (!r.usage.inUse) {
        return <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Not used this year</span>;
      }
      return (
        <div style={{ fontSize: '.8rem' }}>
          <div>
            {r.usage.classCount} class{r.usage.classCount === 1 ? '' : 'es'}
            {' · '}{r.usage.sectionCount} section{r.usage.sectionCount === 1 ? '' : 's'}
            {' · '}{r.usage.teacherCount} teacher{r.usage.teacherCount === 1 ? '' : 's'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
            {r.usage.classes.slice(0, 4).join(', ')}
            {r.usage.classes.length > 4 ? ` +${r.usage.classes.length - 4} more` : ''}
          </div>
        </div>
      );
    }},
    { key: 'actions', label: '', render: r => (
      <div className="actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Subjects" subtitle={`${subjects?.length ?? 0} subjects in the school`}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* The dialog owns both years now, so this only needs two to exist. */}
            <Button variant="secondary" disabled={(years || []).length < 2}
              onClick={() => setImportOpen(true)}>
              Import from another year
            </Button>
            <Button onClick={openCreate}>+ Add Subject</Button>
          </div>
        } />

      {/* Opened from Subjects, so it starts on the subject list alone. The
          curriculum is left off on purpose: importing a subject list must not
          also decide which class teaches what. Both are still there to tick if
          the year needs building out too. */}
      <ImportYearStructureModal
        open={importOpen}
        targetYear={(years || []).find((y) => String(y._id) === String(selectedYear)) || null}
        years={years}
        defaultParts={{ classes: false, sections: false, subjects: true, curriculum: false, assignments: false }}
        onClose={() => setImportOpen(false)}
        onImported={refetch}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>Academic Year:</label>
            <select className="form-control" style={{ maxWidth: 220 }}
              value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
              {(years || []).map((y) => (
                <option key={y._id} value={y._id}>
                  {y.yearName}{y.status === 'active' ? ' (Active)' : ''}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: 'all',    label: `All (${subjects?.length ?? 0})` },
                { key: 'inUse',  label: `In use (${meta?.inUse ?? 0})` },
                { key: 'unused', label: `Not used (${meta?.notInUse ?? 0})` },
              ].map((t) => (
                <button key={t.key} type="button" onClick={() => setUsageFilter(t.key)}
                  className={`btn btn-sm ${usageFilter === t.key ? 'btn-primary' : 'btn-secondary'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
            Each academic year has its own subject list. Adding, editing or deleting one here affects
            only the year selected above — use <strong>Import from another year</strong> to copy a
            previous year&apos;s subjects across. <em>In use</em> means the subject is set against a
            class or taught in a section that year.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={shown} emptyIcon="📚"
            emptyTitle={usageFilter === 'inUse' ? `No subjects are in use in ${yearName}`
              : usageFilter === 'unused' ? `Every subject is in use in ${yearName}`
              : 'No subjects yet'} />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editSub ? 'Edit Subject' : 'Add Subject'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="subject-form" type="submit" loading={saving}>{editSub ? 'Update' : 'Create'}</Button>
        </>}>
        <form id="subject-form" onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Subject Name</label>
              <input className="form-control" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mathematics" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Code</label>
              <input className="form-control" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="MATH101" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="theory">Theory</option>
                <option value="practical">Practical</option>
                <option value="elective">Elective</option>
              </select>
            </div>
          </div>

          {/* Teachers multi-select.

              A name and an email are not enough to pick the right person: two
              schools out of three have a second "Priya Sharma", and the address
              is usually a variation on the same name. Department and
              designation are what actually separate them — the list endpoint
              has returned both all along, the picker just never showed them. */}
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">Assign Teachers</label>
            {teachLoad ? (
              <div style={{ padding: '12px 0' }}><Spinner size="sm" /></div>
            ) : teachers.length === 0 ? (
              <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: 0 }}>No teachers found</p>
            ) : (
              <>
                <input className="form-control" style={{ marginBottom: 8 }}
                  placeholder="Filter by name, email, department or designation…"
                  value={teachQuery} onChange={e => setTeachQuery(e.target.value)} />
                <div style={{
                  maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '6px 0',
                }}>
                  {shownTeachers.length === 0 ? (
                    <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0, padding: '10px 14px' }}>
                      No teacher matches “{teachQuery}”.
                    </p>
                  ) : shownTeachers.map(t => {
                    const checked = form.teachers.includes(t._id);
                    return (
                      <label key={t._id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '8px 14px', cursor: 'pointer',
                        background: checked ? 'var(--primary-light, #eef2ff)' : 'transparent',
                        transition: 'background .1s',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleTeacher(t._id)}
                          style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer', marginTop: 3 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '.87rem' }}>
                            {t.name}
                            {t.employeeId && (
                              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                                {t.employeeId}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{t.email}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                            {t.department  && <Badge variant="info">{t.department}</Badge>}
                            {t.designation && <Badge variant="muted">{t.designation}</Badge>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            {form.teachers.length > 0 && (
              <p style={{ fontSize: '.75rem', color: 'var(--primary)', marginTop: 6 }}>
                {form.teachers.length} teacher{form.teachers.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Subject" message={`Delete "${del?.subjectName}"?`} />
    </div>
  );
}
