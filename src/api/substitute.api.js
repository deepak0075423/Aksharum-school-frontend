import api from './axios';

// Substitute subject teachers. Part of the timetable module, so every endpoint
// sits behind the same module flag and designation permission as the rest of
// /admin/timetable.

const base = '/admin/substitutions';

// ── The day board ─────────────────────────────────────────────────────────────
// date: 'YYYY-MM-DD'. Returns absent teachers, every affected period grouped
// under them, and coverage state. Reading it also runs detection, so opening
// the page is enough to surface a newly-marked absence.
export const getBoard = (date) => api.get(base, { params: date ? { date } : {} });

// Detect + auto-fill on demand. force ignores the school's autoAssign switch.
export const runAutoAssign = (date, force = false) => api.post(`${base}/run`, { date, force });

// ── Assign / change / cancel ──────────────────────────────────────────────────
// Ranked eligible teachers for one period, each with their six workload counts.
export const getCandidates = (id) => api.get(`${base}/${id}/candidates`);
// force: assign despite a clash the server would otherwise refuse with 409.
export const assign = (id, substituteTeacherId, remarks, force = false) =>
  api.post(`${base}/${id}/assign`, { substituteTeacherId, remarks, force });
export const updateRemarks = (id, remarks) => api.put(`${base}/${id}/remarks`, { remarks });
export const cancel = (id, note) => api.delete(`${base}/${id}`, { data: { note } });

// ── Manual flow (neither attendance nor leave enabled) ────────────────────────
export const getSchedulableTeachers = (date) =>
  api.get(`${base}/schedulable-teachers`, { params: date ? { date } : {} });
export const getTeacherPeriods = (teacherId, date) =>
  api.get(`${base}/teacher-periods`, { params: { teacherId, date } });
export const createManual = (data) => api.post(`${base}/manual`, data);

// ── Workload & reporting ──────────────────────────────────────────────────────
export const getWorkload = (date, teacherIds) =>
  api.get(`${base}/workload`, { params: { date, ...(teacherIds?.length ? { teacherIds: teacherIds.join(',') } : {}) } });
export const getReport  = (from, to) => api.get(`${base}/report`, { params: { from, to } });
export const getHistory = (date)     => api.get(`${base}/history`, { params: { date } });

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings  = ()     => api.get(`${base}/settings`);
export const saveSettings = (data) => api.put(`${base}/settings`, data);

// ── Teacher side ──────────────────────────────────────────────────────────────
// My substitute duties + my own periods someone else is covering.
export const getMySubstitutions = (from, to) =>
  api.get('/teacher/substitutions', { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } });
