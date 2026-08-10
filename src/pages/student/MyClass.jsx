import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getMyClass } from '../../api/student.api';
import { PageHeader, Card, Spinner } from '../../components/ui/index';

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="text-muted">{k}</span><strong>{v || '—'}</strong>
    </div>
  );
}

function TeacherLine({ t, role }) {
  if (!t) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div className="avatar" style={{ background: 'var(--primary)', color: '#fff', flexShrink: 0 }}>{t.name?.[0]?.toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
        <div className="text-muted text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.email}>{t.email}</div>
      </div>
      {role && (
        <span style={{
          flexShrink: 0, whiteSpace: 'nowrap', fontSize: '.7rem', fontWeight: 700,
          padding: '3px 9px', borderRadius: 999,
          background: role === 'Vice' ? 'var(--bg-secondary)' : 'color-mix(in srgb, var(--primary) 15%, transparent)',
          color: role === 'Vice' ? 'var(--text-muted)' : 'var(--primary)',
        }}>{role}</span>
      )}
    </div>
  );
}

export default function StudentMyClass() {
  const { data, loading } = useFetch(getMyClass);
  if (loading) return <div className="loading-page"><Spinner /></div>;

  const { section, subjectTeachers = [], classmates = [], monitors = [], announcements = [], profile } = data || {};

  if (!section) {
    return (
      <div className="page">
        <PageHeader title="My Class" subtitle="Current class and section info" />
        <div className="alert alert-warning">You haven't been assigned to a class yet. Please contact your school office.</div>
      </div>
    );
  }

  const className = section.class?.className || (section.class?.classNumber ? `Class ${section.class.classNumber}` : '');

  return (
    <div className="page">
      <PageHeader
        title={`${className}${section.sectionName ? ` — ${section.sectionName}` : ''}`}
        subtitle={section.academicYear?.yearName ? `Academic year ${section.academicYear.yearName}` : 'My class & section'} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* Class info */}
        <Card title="📋 Class Information">
          <Row k="Class"       v={className} />
          <Row k="Section"     v={section.sectionName} />
          {profile?.rollNumber ? <Row k="My Roll No." v={profile.rollNumber} /> : null}
          <Row k="Classmates"  v={classmates.length} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
            <span className="text-muted">Class strength</span><strong>{section.currentCount ?? classmates.length} / {section.maxStudents ?? '—'}</strong>
          </div>
        </Card>

        {/* Teachers */}
        <Card title="👨‍🏫 Class Teachers">
          {section.classTeacher || section.substituteTeacher ? (
            <>
              <TeacherLine t={section.classTeacher} role="Class Teacher" />
              <TeacherLine t={section.substituteTeacher} role="Vice" />
            </>
          ) : <p className="text-muted">No class teacher assigned.</p>}
        </Card>

        {/* Subject teachers */}
        {subjectTeachers.length > 0 && (
          <Card title="📚 Subject Teachers">
            {subjectTeachers.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < subjectTeachers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontWeight: 600 }}>{s.subject}</span>
                <span className="text-muted">{s.teacher || '—'}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Class monitors */}
        {monitors.length > 0 && (
          <Card title="⭐ Class Monitors">
            {monitors.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span>⭐</span><strong>{m.name}</strong>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 600 }}>📢 Class Announcements</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {announcements.map(a => (
              <div key={a._id} className="card"><div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <strong>{a.title}</strong>
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(a.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
                <div style={{ fontSize: '.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{a.message}</div>
              </div></div>
            ))}
          </div>
        </div>
      )}

      {/* Classmates roster */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 600 }}>👥 Classmates ({classmates.length})</h3>
        <div className="card"><div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {classmates.map(c => (
            <div key={c._id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
              background: c.isMe ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--bg-secondary)',
            }}>
              <div className="avatar avatar-sm" style={{ background: 'var(--primary)', color: '#fff', flexShrink: 0 }}>{c.name?.[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}{c.isMe && <span style={{ color: 'var(--primary)', fontSize: '.7rem', fontWeight: 700 }}> (you)</span>}
                </div>
                {c.rollNumber ? <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Roll {c.rollNumber}</div> : null}
              </div>
            </div>
          ))}
        </div></div>
      </div>
    </div>
  );
}
