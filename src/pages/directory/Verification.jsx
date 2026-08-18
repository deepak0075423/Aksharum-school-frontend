import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getVerificationQueue, setVerification } from '../../api/employeeDirectory.api';
import { PageHeader, Empty, Badge, Button } from '../../components/ui/index';
import {
  SkeletonRows, ErrorState, Avatar, Meter, VERIFY_TONE, fileUrl, useDirectoryBase,
} from './parts';

// ─────────────────────────────────────────────────────────────────────────────
//  Profile verification.
//
//  Signing a section off means someone looked at the evidence, so the button
//  does not exist until they have. What counts as evidence depends on the
//  section:
//
//    • Backed by uploads (Government ID, Employment Documents) — every document
//      on file must be opened. A section of this kind with NOTHING uploaded
//      cannot be verified at all; the server refuses it too.
//    • Field-only (Personal, Contact, Education, Bank) — the employee's profile
//      must be opened, where those values actually live.
//
//  "Reviewed" is deliberately per session and not persisted: it records that
//  THIS reviewer opened the evidence before signing, not that anyone ever did.
// ─────────────────────────────────────────────────────────────────────────────

export default function Verification() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getVerificationQueue, []);
  const [busy, setBusy] = useState('');
  // ?employee=<id> opens that reviewer panel straight away, so the dashboard's
  // "pending verification" tile can link to a specific person.
  const [params] = useSearchParams();
  const [open, setOpen] = useState(() => params.get('employee') || '');
  const [seen, setSeen] = useState(() => new Set());

  const mark = (key) => setSeen((s) => new Set(s).add(key));
  const evidenceKeys = (employeeId, sec) => (
    sec.documents.length
      ? sec.documents.map((d) => `${employeeId}:${sec.section}:${d.key}`)
      : [`${employeeId}:${sec.section}:profile`]
  );
  const reviewed = (employeeId, sec) => evidenceKeys(employeeId, sec).every((k) => seen.has(k));

  const verify = async (employeeId, section, status) => {
    setBusy(`${employeeId}:${section}`);
    try {
      await setVerification(employeeId, { section, status });
      toast.success(status === 'verified' ? 'Section verified' : 'Section marked pending');
      refetch();
    } catch (err) { toast.error(err.message || 'Could not update'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="page"><PageHeader title="Profile Verification" /><SkeletonRows rows={8} cols={4} /></div>;
  if (error)   return <div className="page"><PageHeader title="Profile Verification" /><ErrorState error={error} onRetry={refetch} /></div>;

  const employees = data?.employees || [];

  return (
    <div className="page">
      <PageHeader
        title="Profile Verification"
        subtitle={`${data.fullyVerified} of ${employees.length} employees fully verified`}
      />

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {(data.sectionTotals || []).map((s) => (
          <div key={s.section} className="stat-card">
            <div className="stat-card__info">
              <div className="stat-card__value" style={{ fontSize: '1.2rem' }}>
                {s.verified}<span className="text-muted" style={{ fontSize: '.85rem', fontWeight: 400 }}> / {s.verified + s.pending + s.rejected}</span>
              </div>
              <div className="stat-card__label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {employees.length === 0 ? (
        <Empty icon="🔎" title="No employees found." message="Verification appears once your school has staff records." />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th /><th>Employee</th><th>Progress</th><th>Sections</th><th>Profile</th><th style={{ width: 110 }} /></tr></thead>
              <tbody>
                {employees.map((e) => (
                  <React.Fragment key={e._id}>
                    <tr>
                      <td><Avatar name={e.name} src={e.profileImage} size={32} /></td>
                      <td>
                        <Link to={`${base}/employees/${e._id}`} style={{ fontWeight: 600 }}>{e.name}</Link>
                        <div className="text-muted text-sm">{[e.employeeId, e.designation].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <div className="text-sm" style={{ marginBottom: 4 }}>{e.verifiedCount} / {e.totalSections}</div>
                        <Meter value={e.percent} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {e.sections.map((s) => (
                            <Badge key={s.section} variant={VERIFY_TONE[s.status]}>{s.label}</Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={e.profileCompletion < 100 ? 'badge badge-warning' : 'badge badge-success'}>
                          {e.profileCompletion}%
                        </span>
                      </td>
                      <td>
                        <Button size="sm" variant="secondary" onClick={() => setOpen(open === e._id ? '' : e._id)}>
                          {open === e._id ? 'Close' : 'Review'}
                        </Button>
                      </td>
                    </tr>

                    {open === e._id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)', padding: 0 }}>
                          <div style={{ padding: '14px 18px' }}>
                            <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                              Open the evidence for a section to unlock its Verify button.
                            </p>
                            {e.sections.map((s) => {
                              const done = reviewed(e._id, s);
                              const blocked = s.missingDocuments;
                              return (
                                <div key={s.section} style={{
                                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                                }}>
                                  <span style={{ flex: '1 1 190px', fontWeight: 600, fontSize: '.88rem' }}>{s.label}</span>

                                  <span style={{ flex: '2 1 320px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {blocked && <span className="badge badge-warning">No document on file</span>}

                                    {s.documents.map((d) => {
                                      const k = `${e._id}:${s.section}:${d.key}`;
                                      return (
                                        <a
                                          key={d.key}
                                          className={`btn btn-sm ${seen.has(k) ? 'btn-secondary' : 'btn-primary'}`}
                                          href={fileUrl(d.url)} target="_blank" rel="noreferrer"
                                          onClick={() => mark(k)}
                                        >
                                          {seen.has(k) ? '✓ ' : '👁 '}{d.label}
                                        </a>
                                      );
                                    })}

                                    {!blocked && s.documents.length === 0 && (
                                      <Link
                                        className={`btn btn-sm ${seen.has(`${e._id}:${s.section}:profile`) ? 'btn-secondary' : 'btn-primary'}`}
                                        to={`${base}/employees/${e._id}`} target="_blank" rel="noreferrer"
                                        onClick={() => mark(`${e._id}:${s.section}:profile`)}
                                      >
                                        {seen.has(`${e._id}:${s.section}:profile`) ? '✓ ' : '👁 '}Review details
                                      </Link>
                                    )}
                                  </span>

                                  <Badge variant={VERIFY_TONE[s.status]}>
                                    {s.status === 'verified' ? 'Verified' : s.status === 'rejected' ? 'Rejected' : 'Pending'}
                                  </Badge>

                                  <span style={{ display: 'flex', gap: 6 }}>
                                    <Button
                                      size="sm" variant="success"
                                      disabled={blocked || !done || s.status === 'verified'}
                                      loading={busy === `${e._id}:${s.section}`}
                                      title={blocked
                                        ? 'Nothing has been uploaded for this section yet'
                                        : !done ? 'Open the evidence above first' : undefined}
                                      onClick={() => verify(e._id, s.section, 'verified')}
                                    >
                                      Verify
                                    </Button>
                                    {s.status !== 'pending' && (
                                      <Button size="sm" variant="secondary"
                                        onClick={() => verify(e._id, s.section, 'pending')}>
                                        Reset
                                      </Button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
