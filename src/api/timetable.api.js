import api from './axios';

// Timetable generation, configuration, versioning & publishing.
// The live/manual section editor keeps using the endpoints in admin.api.js.

const base = '/admin/timetable';

// ── Meta & configuration ──────────────────────────────────────────────────────
export const getMeta      = (yearId) => api.get(`${base}/meta`, { params: yearId ? { yearId } : {} });
export const getConfig    = (yearId) => api.get(`${base}/config`, { params: yearId ? { yearId } : {} });
// Subjects, weekly capacity and saved period counts for one class + its sections.
export const getClassPlan = (classId, sectionIds, yearId) => api.get(`${base}/class-plan`, {
  params: { classId, ...(sectionIds?.length ? { sectionIds: sectionIds.join(',') } : {}), ...(yearId ? { yearId } : {}) },
});
export const saveConfig   = (data)   => api.put(`${base}/config`, data);

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const getRooms     = (params) => api.get(`${base}/rooms`, { params });
export const createRoom   = (data)   => api.post(`${base}/rooms`, data);
export const updateRoom   = (id, d)  => api.put(`${base}/rooms/${id}`, d);
export const deleteRoom   = (id)     => api.delete(`${base}/rooms/${id}`);

// ── Teacher availability ──────────────────────────────────────────────────────
export const getAvailability  = (yearId)        => api.get(`${base}/availability`, { params: yearId ? { yearId } : {} });
export const saveAvailability = (teacherId, d)  => api.put(`${base}/availability/${teacherId}`, d);

// ── Generation & versions ─────────────────────────────────────────────────────
export const generate       = (data)      => api.post(`${base}/generate`, data);
export const getVersions    = (params)    => api.get(`${base}/versions`, { params });
export const getVersion     = (id)        => api.get(`${base}/versions/${id}`);
export const getProgress    = (id)        => api.get(`${base}/versions/${id}/progress`);
export const getConflicts   = (id, p)     => api.get(`${base}/versions/${id}/conflicts`, { params: p });
export const updateVersion  = (id, d)     => api.put(`${base}/versions/${id}`, d);
export const deleteVersion  = (id)        => api.delete(`${base}/versions/${id}`);
export const validateVersion = (id)       => api.post(`${base}/versions/${id}/validate`);
export const publishVersion  = (id)       => api.post(`${base}/versions/${id}/publish`);
export const regenerate      = (id, d)    => api.post(`${base}/versions/${id}/regenerate`, d);
export const duplicateVersion = (id, d)   => api.post(`${base}/versions/${id}/duplicate`, d);
export const restoreVersion   = (id)      => api.post(`${base}/versions/${id}/restore`);
export const archiveVersion   = (id)      => api.post(`${base}/versions/${id}/archive`);
export const releaseLock      = (id)      => api.post(`${base}/versions/${id}/release-lock`);
export const compareVersions  = (id, o)   => api.get(`${base}/versions/${id}/compare/${o}`);

// ── Entries (manual editing) ──────────────────────────────────────────────────
export const createEntry = (id, d)          => api.post(`${base}/versions/${id}/entries`, d);
export const moveEntry   = (id, entryId, d) => api.post(`${base}/versions/${id}/entries/${entryId}/move`, d);
export const updateEntry = (id, entryId, d) => api.put(`${base}/versions/${id}/entries/${entryId}`, d);
export const deleteEntry = (id, entryId)    => api.delete(`${base}/versions/${id}/entries/${entryId}`);

// ── Audit & export ────────────────────────────────────────────────────────────
export const getAudit = (params) => api.get(`${base}/audit`, { params });
export const exportVersion = (id, view, format) =>
  api.get(`${base}/versions/${id}/export`, { params: { view, format }, responseType: 'blob' });
