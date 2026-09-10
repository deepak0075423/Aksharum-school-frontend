import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getAttendance, markAttendance,
  getMyAttendance, clockIn, clockOut, submitRegularization, getMyRegularizations,
  getCorrectionRequests, reviewCorrection, getClassRanking,
} from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../components/ui/index';
import SelfAttendance from '../../components/attendance/SelfAttendance';
import ClassRanking from '../../components/attendance/ClassRanking';
import { useSearchParams } from 'react-router-dom';

// ── Class attendance ranking ──────────────────────────────────────────────────
function SectionRanking() {
  const { data, loading } = useFetch(getClassRanking);
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;
  const ranking = data?.ranking || [];
  return (
    <>
      <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        Students in {data?.section?.sectionName ? <strong>{data.section.sectionName}</strong> : 'your section'} ranked by attendance percentage this academic year.
      </p>
      <ClassRanking ranking={ranking} />
    </>
  );
}

const STATUS_COLORS = { present: '#10b981', absent: '#ef4444', late: '#f59e0b' };
const STATUS_OPTS   = ['present', 'absent', 'late'];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Tab 1: Mark Student Attendance — class teacher or vice class teacher.
 *
 * A teacher can own more than one section: their own class, plus any they
 * cover as vice. The server used to pick one and never say which, so covering
 * a second class meant a register you could not reach. `?section=` names one —
 * that is what My Section's "Take Attendance" links carry — and the picker is
 * there for the rest.
 */
function MarkAttendance({ wantedSection }) {
  const today = new Date().toISOString().split('T')[0];
  const [date,     setDate]     = useState(today);
  const [sectionId, setSectionId] = useState(wantedSection || '');
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [records,  setRecords]  = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const fetchAttendance = async (d, id) => {
    setLoading(true);
    try {
      const res = await getAttendance({ date: d, section: id || undefined });
      const body = res?.data || {};
      setSections(body.sections || []);
      // The server answers with the section it actually used, so the picker
      // shows the register on screen rather than the one that was asked for.
      if (body.section?._id) setSectionId(String(body.section._id));
      if (body.refused) toast.error(body.refused);
      setStudents(body.students || []);
      const map = {};
      (body.records || []).forEach(r => { map[String(r.student)] = r.status; });
      setRecords(map);
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAttendance(date, sectionId); }, [date, sectionId]);

  const markAll = (status) => {
    const map = {};
    students.forEach(s => { map[String(s.user?._id || s._id)] = status; });
    setRecords(map);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const recs = students.map(s => ({
        studentId: s.user?._id || s._id,
        status: records[String(s.user?._id || s._id)] || 'absent',
      }));
      await markAttendance({ date, section: sectionId || undefined, records: recs });
      toast.success('Attendance saved!');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {sections.length > 1 && (
          <select className="form-control" style={{ maxWidth: 260 }} aria-label="Section"
            value={sectionId} onChange={e => setSectionId(e.target.value)}>
            {sections.map(sec => (
              <option key={sec._id} value={sec._id}>
                {sec.label}{sec.role === 'vice' ? ' — vice' : ''}
              </option>
            ))}
          </select>
        )}
        <input type="date" className="form-control" style={{ maxWidth: 200 }}
          value={date} max={today} onChange={e => setDate(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('present')}>All Present</button>
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('absent')}>All Absent</button>
        <div style={{ flex: 1 }} />
        <Button onClick={handleSave} loading={saving}>Save Attendance</Button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {!students.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                {sections.length
                  ? `No students enrolled in ${sections.find(x => x._id === sectionId)?.label || 'this section'}.`
                  : 'You are not the class teacher or vice class teacher of any section, so there is no register to mark.'}
              </div>
            ) : (
              <table className="table">
                <thead><tr><th>#</th><th>Student</th><th>Roll No</th><th>Status</th></tr></thead>
                <tbody>
                  {students.map((s, i) => {
                    const id = String(s.user?._id || s._id);
                    const st = records[id] || 'absent';
                    return (
                      <tr key={id}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar avatar-sm">{(s.user?.name || s.name)?.[0]}</div>
                            <span>{s.user?.name || s.name}</span>
                          </div>
                        </td>
                        <td>{s.rollNumber || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {STATUS_OPTS.map(opt => (
                              <button key={opt}
                                onClick={() => setRecords(r => ({ ...r, [id]: opt }))}
                                style={{ textTransform: 'capitalize', minWidth: 84,
                                  background: st === opt ? STATUS_COLORS[opt] : undefined,
                                  color: st === opt ? '#fff' : undefined,
                                  borderColor: STATUS_COLORS[opt],
                                }}
                                className={`btn btn-sm ${st === opt ? '' : 'btn-secondary'}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 3: Student Correction Requests ────────────────────────────────────────
function CorrectionRequests() {
  const [actLoad, setActLoad] = useState(null);
  const { data, loading, refetch } = useFetch(getCorrectionRequests);
  const requests = Array.isArray(data) ? data : [];

  const handleReview = async (id, status) => {
    setActLoad(id);
    try {
      await reviewCorrection({ id, status });
      toast.success(status === 'approved' ? 'Approved' : 'Rejected');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(null); }
  };

  const columns = [
    { key: 'student', label: 'Student',  render: r => r.student?.name || '—' },
    { key: 'date',    label: 'Date',     render: r => fmtDate(r.date) },
    { key: 'requested', label: 'Requested', render: r => <span style={{ textTransform: 'capitalize' }}>{r.requestedStatus || '—'}</span> },
    { key: 'reason',  label: 'Reason',   render: r => <span style={{ fontSize: '.85rem' }}>{r.reason || '—'}</span> },
    { key: 'status',  label: 'Status',
      render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'actions', label: '',
      render: r => r.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" loading={actLoad === r._id} onClick={() => handleReview(r._id, 'approved')}>Approve</Button>
          <button className="btn btn-danger btn-sm" onClick={() => handleReview(r._id, 'rejected')}>Reject</button>
        </div>
      )},
  ];

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        {loading
          ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          : <Table columns={columns} data={requests} emptyIcon="✅" emptyTitle="No correction requests" />}
      </div>
    </div>
  );
}

export default function TeacherAttendance() {
  // Notifications link straight at a tab (?tab=…), so the page opens where the
  // notification was about rather than on its default.
  const [searchParams] = useSearchParams();
  const wantedTab = searchParams.get('tab');
  // My Section links here with the section it wants the register for.
  const wantedSection = searchParams.get('section');
  const [tab, setTab] = useState(
    ['mark', 'ranking', 'mine', 'correct'].includes(wantedTab) ? wantedTab : 'mark');
  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Mark your section and clock your own day" />
      <div className="tabs">
        <button className={`tab${tab === 'mark' ? ' active' : ''}`}    onClick={() => setTab('mark')}>Mark Students</button>
        <button className={`tab${tab === 'ranking' ? ' active' : ''}`} onClick={() => setTab('ranking')}>🏆 Class Ranking</button>
        <button className={`tab${tab === 'mine' ? ' active' : ''}`}    onClick={() => setTab('mine')}>My Attendance</button>
        <button className={`tab${tab === 'correct' ? ' active' : ''}`} onClick={() => setTab('correct')}>Student Corrections</button>
      </div>
      {tab === 'mark'    && <MarkAttendance wantedSection={wantedSection} />}
      {tab === 'ranking' && <SectionRanking />}
      {tab === 'mine'    && (
        <SelfAttendance
          api={{ getMyAttendance, clockIn, clockOut }}
          regularization={{ submit: submitRegularization, list: getMyRegularizations }}
        />
      )}
      {tab === 'correct' && <CorrectionRequests />}
    </div>
  );
}
