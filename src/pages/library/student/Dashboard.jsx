import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks, getMyFines, getTeacherMyBooks, getTeacherMyFines } from '../../../api/library.api';
import { PageHeader, Spinner } from '../../../components/ui/index';

// LibraryIssuance.status is one of issued / overdue / returned / lost. There has
// never been an 'active' — the tile counted `b.status === 'active'` and so read
// zero for every member who has ever had a book out. A loan the member still
// holds is one that has not come back and has not been written off.
const OUT_ON_LOAN = ['issued', 'overdue'];

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function LibraryStudentDashboard() {
  const { user }    = useAuth();
  const isTeacher   = user?.role === 'teacher';
  // The teacher endpoints are a separate mount; hitting the student ones as a
  // teacher 403s and left both tiles at zero for exactly the same reason.
  const { data: books, loading: bl } = useFetch(isTeacher ? getTeacherMyBooks : getMyBooks, [isTeacher]);
  const { data: fines, loading: fl } = useFetch(isTeacher ? getTeacherMyFines : getMyFines, [isTeacher]);

  const basePath = isTeacher ? '/teacher/library' : '/student/library';

  const rows      = Array.isArray(books) ? books : [];
  const fineRows  = Array.isArray(fines) ? fines : [];

  const issued  = rows.filter(b => OUT_ON_LOAN.includes(b.status));
  const overdue = rows.filter(b => b.status === 'overdue' || b.isOverdue).length;
  const lost    = rows.filter(b => b.status === 'lost').length;

  // What is still owed, not what was originally charged: a part-waived fine
  // that has been settled is not money the member has to find.
  const owed = fineRows.reduce((sum, f) => sum + Math.max(
    0,
    Number(f.amount || 0) - Number(f.waivedAmount || 0) - Number(f.paidAmount || 0),
  ), 0);
  const pendingFines = fineRows.filter(f => f.status === 'pending').length;

  const tiles = [
    { label: 'Books Issued', value: issued.length, bg: '#d1fae5', to: `${basePath}/my-books` },
    { label: 'Overdue',      value: overdue,       bg: '#fef3c7', to: `${basePath}/my-books`, hide: !overdue },
    { label: 'Lost',         value: lost,          bg: '#e5e7eb', to: `${basePath}/my-books`, hide: !lost },
    { label: 'Pending Fines', value: pendingFines, sub: owed > 0 ? rupees(owed) + ' outstanding' : null,
      bg: '#fee2e2', to: `${basePath}/my-fines` },
  ].filter(t => !t.hide);

  const quickLinks = [
    { to: `${basePath}/search`,   icon: '🔍', label: 'Search Books', color: '#dbeafe' },
    { to: `${basePath}/my-books`, icon: '📚', label: 'My Books',     color: '#d1fae5' },
    { to: `${basePath}/my-fines`, icon: '💰', label: 'My Fines',     color: '#fee2e2' },
  ];

  return (
    <div className="page">
      <PageHeader title="Library" subtitle="School library portal" />

      {(bl || fl) ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
            {tiles.map(t => (
              <Link key={t.label} to={t.to}
                style={{
                  background: t.bg, borderRadius: 'var(--radius)', padding: '16px 20px',
                  textDecoration: 'none', color: 'var(--text)', display: 'block',
                }}>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{t.value}</div>
                {t.sub && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{t.sub}</div>}
              </Link>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: l.color, borderRadius: 'var(--radius-lg)', padding: '20px 12px',
                  textDecoration: 'none', color: 'var(--text)', gap: 8,
                  transition: 'transform .15s, box-shadow .15s', textAlign: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <span style={{ fontSize: '1.8rem' }}>{l.icon}</span>
                <span style={{ fontWeight: 500, fontSize: '.85rem' }}>{l.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
