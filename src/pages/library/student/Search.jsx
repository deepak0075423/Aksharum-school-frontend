import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { studentSearch, studentReserve, cancelMyReservation, teacherSearch, teacherReserve, cancelTeacherReserv }
  from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Spinner, Pagination } from '../../../components/ui/index';
import { useAuth } from '../../../contexts/AuthContext';

export default function LibrarySearch() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';

  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState('');
  const [page,     setPage]     = useState(1);

  // Every call on this page goes through the endpoint the caller's role is
  // allowed to use; the two sets serve the same catalogue and the same queue.
  const search  = isTeacher ? teacherSearch : studentSearch;
  const unqueue = isTeacher ? cancelTeacherReserv : cancelMyReservation;

  const { data, meta, loading, refetch } = useFetch(
    () => search({ q: query || undefined, category: category || undefined, page, limit: 20 }),
    [query, category, page, isTeacher],
  );
  const books = Array.isArray(data) ? data : [];

  // A teacher hitting the student route is refused by the guard — the two roles
  // reach the same queue through their own endpoints.
  const handleReserve = async (bookId) => {
    try {
      const res = await (isTeacher ? teacherReserve(bookId) : studentReserve(bookId));
      const pos = res?.data?.queuePosition;
      toast.success(res?.data?.status === 'ready'
        ? 'Ready to collect — pick it up from the library'
        : `Reserved — you are number ${pos ?? '?'} in the queue`);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not reserve the book'); }
  };

  const handleCancel = async (reservationId) => {
    try { await unqueue(reservationId); toast.success('Reservation cancelled'); refetch(); }
    catch (err) { toast.error(err?.message || 'Could not cancel the reservation'); }
  };

  const columns = [
    { key: 'title',    label: 'Title',     render: r => <div><div style={{ fontWeight:600 }}>{r.title}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.authors||[]).join(', ')}</div></div> },
    { key: 'category', label: 'Category',  render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',   label: 'Available', render: r => r.availableCopies > 0
      ? <Badge variant="success">{r.availableCopies} available</Badge>
      : <Badge variant="warning">On loan</Badge> },
    { key: 'actions',  label: '', render: r => {
      const myRes = r.myReservation;
      if (myRes && (myRes.status === 'pending' || myRes.status === 'ready')) {
        return (
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <Badge variant={myRes.status === 'ready' ? 'success' : 'warning'}>{myRes.status === 'ready' ? 'Ready to collect' : 'Reserved'}</Badge>
            <button className="btn btn-secondary btn-sm" onClick={() => handleCancel(myRes._id)}>Cancel</button>
          </div>
        );
      }
      return <Button size="sm" variant={r.availableCopies > 0 ? 'primary' : 'secondary'} onClick={() => handleReserve(r._id)}>
        {r.availableCopies > 0 ? 'Reserve' : 'Join Queue'}
      </Button>;
    }},
  ];

  return (
    <div className="page">
      <PageHeader title="Search Books" subtitle="Find books in the library" />
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input className="form-control" placeholder="Search by title, author, ISBN…" style={{ maxWidth:320 }}
          value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        <input className="form-control" placeholder="Category…" style={{ maxWidth:160 }}
          value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="🔍" emptyTitle={query || category ? 'No books found' : 'Start searching…'} />}
        </div>
        {meta?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      </div>
    </div>
  );
}
