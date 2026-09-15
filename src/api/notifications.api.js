import api from './axios';
export const getInbox            = () => api.get('/notifications/inbox');
// The notifications page's list. Every filter is a server parameter — an
// account a year old has thousands of receipts, and narrowing only the page
// already fetched would answer the wrong question. Called bare, it returns
// every receipt newest-first, which is what the teacher/student/parent page
// and the mobile app still do.
export const getAllNotifications  = (params) => api.get('/notifications/all', { params });
export const getUnreadCount      = () => api.get('/notifications/unread-count');
export const getSent             = (params) => api.get('/notifications/sent', { params });
// `child` (parents only): act on that child's view of the mailbox, not all of it.
export const markAllRead         = (child) => api.post('/notifications/mark-all-read', child ? { child } : {});
export const clearAll            = () => api.post('/notifications/clear-all');
// Clears every notification already read, and only those — see archiveRead in
// the controller for why an unread one is never swept up.
export const archiveRead         = (child) => api.post('/notifications/archive-read', child ? { child } : {});
// The selection bar. `action` is read | unread | archive | restore | delete —
// delete removes the reader's receipt, never the notification itself, which is
// one row shared with everybody else who received it.
export const bulkNotifications   = (ids, action) => api.post('/notifications/bulk', { ids, action });
// Empties one box — 'inbox', 'archived' or 'all'.
export const deleteAllNotifications = (box, child) => api.post('/notifications/delete-all', child ? { box, child } : { box });
export const markOneRead         = (id) => api.patch(`/notifications/${id}/mark-read`);
export const markOneUnread       = (id) => api.patch(`/notifications/${id}/mark-unread`);
// Archive / un-archive one. The DELETE is the bell's "clear", which is the same
// thing; restore is the half only the notifications page needs.
export const clearOne            = (id) => api.delete(`/notifications/${id}`);
export const restoreOne          = (id) => api.post(`/notifications/${id}/restore`);
// Where one notification goes — and marks it read. Used by the /n/:id route the
// notification emails link to, so a link works from any device or role.
export const resolveNotification = (receiptId) => api.get(`/notifications/${receiptId}/resolve`);
