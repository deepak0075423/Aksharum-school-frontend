import api from './axios';

// ── Librarian / Admin ─────────────────────────────────────────────────────────
export const getDashboard        = ()           => api.get('/library/dashboard');
export const getBooks            = (params)     => api.get('/library/books', { params });
export const getBook             = (id, params) => api.get(`/library/books/${id}`, { params });
// The book's history, its queue and its neighbours. A second call on purpose:
// none of it changes when the copy list is paged or filtered.
export const getBookActivity     = (id)         => api.get(`/library/books/${id}/activity`);
export const createBook          = (data)       => api.post('/library/books', data);
export const updateBook          = (id, data)   => api.put(`/library/books/${id}`, data);
export const deleteBook          = (id)         => api.delete(`/library/books/${id}`);
// The cover is its own call — the file needs a book to belong to, so it follows
// the create rather than riding along with it.
export const uploadBookCover     = (id, file)   => {
  const fd = new FormData();
  fd.append('cover', file);
  return api.post(`/library/books/${id}/cover`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
// Each id runs through the same refusals a single delete does; the reply says
// which ones stayed put and why.
export const bulkDeleteBooks     = (ids)        => api.post('/library/books/bulk-delete', { ids });
export const importBooks         = (file)       => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/library/books/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const getClassList        = ()           => api.get('/library/classes');

// Physical copies of a catalogue title — a book with no copies cannot be issued
export const addCopies           = (bookId, data)         => api.post(`/library/books/${bookId}/copies`, data);
export const updateCopy          = (bookId, copyId, data) => api.put(`/library/books/${bookId}/copies/${copyId}`, data);
export const setCopyStatus       = (bookId, copyId, status, chargeLastBorrower = false, fineAmount) =>
  api.patch(`/library/books/${bookId}/copies/${copyId}/status`, { status, chargeLastBorrower, fineAmount });
export const deleteCopy          = (bookId, copyId)       => api.delete(`/library/books/${bookId}/copies/${copyId}`);
// Counter helpers — member typeahead and the barcode scanner
export const searchMembers       = (q, role)    => api.get('/library/members', { params: { q, role } });
export const scanCopy            = (code)       => api.get('/library/scan', { params: { code } });
export const labelSheetUrl       = (bookId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return `${api.defaults.baseURL}/library/books/${bookId}/labels${qs ? `?${qs}` : ''}`;
};

export const getIssuances        = (params)     => api.get('/library/issuances', { params });
export const getIssueForm        = (params)     => api.get('/library/issue', { params });
export const issueBook           = (data)       => api.post('/library/issue', data);
export const getReturnForm       = (params)     => api.get('/library/return', { params });
export const returnBook          = (data)       => api.post('/library/return', data);
export const renewBook           = (id)         => api.post(`/library/issuances/${id}/renew`);
// Each id runs through the same renewal rules a single one does; the reply says
// which were refused and why.
export const bulkRenew           = (ids)        => api.post('/library/issuances/renew', { ids });
export const getReservations     = (params)     => api.get('/library/reservations', { params });
// Queueing somebody at the desk — through exactly the rules a member's own
// reservation goes through (services/libraryRules.placeReservation).
export const createReservation   = (data)       => api.post('/library/reservations', data);
export const markReservationReady= (id)         => api.post(`/library/reservations/${id}/mark-ready`);
export const cancelReservation   = (id, reason) => api.delete(`/library/reservations/${id}`, { data: { reason } });
export const getFines            = (params)     => api.get('/library/fines', { params });
export const collectFine         = (id)         => api.post(`/library/fines/${id}/collect`);
// Settling several at once — each still gets its own receipt, because a receipt
// covering three fines is not a document this module knows how to produce.
export const collectFines        = (ids)        => api.post('/library/fines/collect', { ids });
// Raising one by hand, against an existing loan.
export const createFine          = (data)       => api.post('/library/fines', data);
// `amount` omitted waives the whole outstanding balance; a number waives part.
export const waiveFine           = (id, data)   => api.post(`/library/fines/${id}/waive`, data);
export const getPolicy           = ()           => api.get('/library/policy');
export const updatePolicy        = (data)       => api.put('/library/policy', data);
// What the rules used to say. Open to whoever may change them, unlike the
// audit log, which stays school-admin only.
export const getPolicyHistory    = ()           => api.get('/library/policy/history');
export const getAuditLog         = (params)     => api.get('/library/audit-log', { params });

// ── Reports ───────────────────────────────────────────────────────────────────
export const listReports         = ()           => api.get('/library/reports');
export const runReport           = (path, params) => api.get(path, { params });
// The overdue register's own action: the notice a librarian would otherwise
// chase by hand, sent to the borrower and — for a student — to their parents.
export const remindOverdue       = (ids)        => api.post('/library/reports/overdue/remind', { ids });
/**
 * Downloads an authenticated endpoint as a file. The API is bearer-token
 * authenticated, so a plain link would arrive without credentials — fetch it,
 * then hand the browser a blob.
 */
export const downloadFile = async (path, params = {}, filename = 'download.xlsx') => {
  // URLSearchParams stringifies undefined as the literal "undefined", so an
  // unset filter arrives as `q=undefined` and the server dutifully searches for
  // a book called "undefined" — which is how the catalogue export came back
  // empty. Only send keys that carry a value.
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();

  const res = await fetch(`${api.defaults.baseURL}${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.message || 'Download failed');
  }

  // An endpoint that also serves JSON returns JSON unless asked for a
  // spreadsheet. Saving that under an .xlsx name produces a file the OS refuses
  // to open with no clue why — so check what actually came back.
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || 'The server returned data, not a file — the export is missing format=xlsx');
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── Student ────────────────────────────────────────────────────────────────────
export const studentDashboard    = ()           => api.get('/library/student');
export const studentSearch       = (params)     => api.get('/library/student/search', { params });
export const studentReserve      = (bookId)     => api.post(`/library/student/books/${bookId}/reserve`);
export const cancelMyReservation = (id)         => api.delete(`/library/student/reservations/${id}`);
export const getMyBooks          = ()           => api.get('/library/student/my-books');
export const getMyFines          = ()           => api.get('/library/student/my-fines');

// ── Paying a fine, and the receipt that follows ───────────────────────────────
// Shared by students, teachers and parents; the server decides whose fines the
// caller may act on, so the client never sends a "who am I" claim it invented.
export const getFineSummary      = (userId)     => api.get('/library/my-fines/summary', { params: { userId } });
export const createFineOrder     = (data)       => api.post('/library/my-fines/order', data);
export const confirmFinePayment  = (data)       => api.post('/library/my-fines/confirm', data);
export const listMyReceipts      = (userId)     => api.get('/library/my-fines/receipts', { params: { userId } });
export const fineReceiptPath     = (receiptNumber) => `/library/receipts/${encodeURIComponent(receiptNumber)}`;
export const renewMyBook         = (id)         => api.post(`/library/student/issuances/${id}/renew`);

// ── Teacher browse (same dashboard/search as student) ─────────────────────────
export const teacherLibDashboard = ()           => api.get('/library/teacher');
export const teacherSearch       = (params)     => api.get('/library/teacher/search', { params });
export const getTeacherMyBooks   = ()           => api.get('/library/teacher/my-books');
export const getTeacherMyFines   = ()           => api.get('/library/teacher/my-fines');
export const cancelTeacherReserv = (id)         => api.delete(`/library/teacher/reservations/${id}`);
export const teacherReserve      = (bookId)     => api.post(`/library/teacher/books/${bookId}/reserve`);
export const renewTeacherBook    = (id)         => api.post(`/library/teacher/issuances/${id}/renew`);

// ── Parent ─────────────────────────────────────────────────────────────────────
export const getParentOverview   = ()           => api.get('/library/parent');
