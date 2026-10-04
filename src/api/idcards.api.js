// ID Cards — the office's screens, the holders' own pages and the public check.
// See school-backend controllers/idCardAdmin + idCardPortal.
import api from './axios';

const blob = { responseType: 'blob', timeout: 120000 };

// ── Office ───────────────────────────────────────────────────────────────────
export const getIdCardOverview = () => api.get('/admin/id-cards/overview');
export const getIdCardList = (params) => api.get('/admin/id-cards/list', { params });
export const getIdCard = (id) => api.get(`/admin/id-cards/cards/${id}`);
export const getIdCardHolder = (id, kind) => api.get(`/admin/id-cards/holders/${id}`, { params: { kind } });
export const getIdCardActivity = (params) => api.get('/admin/id-cards/activity', { params });
export const lookupIdCard = (q) => api.get('/admin/id-cards/lookup', { params: { q } });

export const previewIdCards = (body) => api.post('/admin/id-cards/generate/preview', body);
export const generateIdCards = (body) => api.post('/admin/id-cards/generate', body, { timeout: 300000 });

export const regenerateIdCard = (id, body) => api.post(`/admin/id-cards/cards/${id}/regenerate`, body || {});
export const reportIdCard = (id, body) => api.post(`/admin/id-cards/cards/${id}/report`, body);
export const replaceIdCard = (id, body) => api.post(`/admin/id-cards/cards/${id}/replace`, body || {});
export const blockIdCard = (id, body) => api.post(`/admin/id-cards/cards/${id}/block`, body);
export const activateIdCard = (id) => api.post(`/admin/id-cards/cards/${id}/activate`, {});
export const cancelIdCard = (id, body) => api.post(`/admin/id-cards/cards/${id}/cancel`, body);

/** A PDF of these cards to print: `layout` card | sheet, `sides` both | front | back. */
export const printIdCards = (body) => api.post('/admin/id-cards/print', body, blob);
export const downloadIdCardAdmin = (id, layout = 'card') => api.get(`/admin/id-cards/cards/${id}/pdf`, { params: { layout }, ...blob });

export const getIdCardTemplates = () => api.get('/admin/id-cards/templates');
export const saveIdCardTemplate = (kind, design) => api.put(`/admin/id-cards/templates/${kind}`, { design });
export const applyIdCardTemplate = (kind) => api.post(`/admin/id-cards/templates/${kind}/apply`, {});

export const getIdCardSettings = () => api.get('/admin/id-cards/settings');
export const saveIdCardSettings = (body) => api.put('/admin/id-cards/settings', body);
export const applyIdCardSettings = () => api.post('/admin/id-cards/settings/apply', {});
export const uploadIdCardImage = (image, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/admin/id-cards/settings/${image}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const removeIdCardImage = (image) => api.delete(`/admin/id-cards/settings/${image}`);

// ── Holders ──────────────────────────────────────────────────────────────────
/** role: student | teacher | parent — each sees their own (a parent, their children's too). */
export const getMyIdCards = (role) => api.get(`/${role}/id-cards`);
export const downloadMyIdCard = (role, id, layout = 'card') => api.get(`/${role}/id-cards/${id}/pdf`, { params: { layout }, ...blob });

// ── Public ───────────────────────────────────────────────────────────────────
export const verifyIdCardPublic = (code) => api.get(`/public/id-card/${encodeURIComponent(code)}`);
