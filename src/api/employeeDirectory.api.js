import api from './axios';

// Employee Directory — one API for school admins and teachers. The backend
// resolves the caller's level from the designation matrix and returns only the
// fields that level is entitled to, so nothing here branches on role: a block
// the caller may not see is simply absent from the response.
const base = '/employee-directory';

export const getMeta        = ()       => api.get(`${base}/meta`);
export const getDashboard   = ()       => api.get(`${base}/dashboard`);
export const getEmployees   = (params) => api.get(`${base}/employees`, { params });
export const getEmployee    = (id)     => api.get(`${base}/employees/${id}`);
export const getTimetable   = (id)     => api.get(`${base}/employees/${id}/timetable`);
export const getAttendance  = (id, params) => api.get(`${base}/employees/${id}/attendance`, { params });
export const getLeave       = (id)     => api.get(`${base}/employees/${id}/leave`);

// Returns ONE unmasked value and is audited server-side. Never called to
// pre-fill a screen — only from an explicit action by the user.
export const revealField    = (id, field) => api.post(`${base}/employees/${id}/reveal`, { field });

export const updateEmployment = (id, body) => api.put(`${base}/employees/${id}/employment`, body);
export const setVerification  = (id, body) => api.put(`${base}/employees/${id}/verification`, body);

export const getDepartments   = () => api.get(`${base}/departments`);
export const getDesignations  = () => api.get(`${base}/designations`);
export const getOrgStructure  = () => api.get(`${base}/org-structure`);
export const getVerificationQueue = () => api.get(`${base}/verification`);

// Employee documents — the office reviews each one and chases what is owed.
export const getDocumentDesk        = ()                => api.get(`${base}/document-desk`);
export const reviewEmployeeDocument = (id, key, body)   => api.put(`${base}/employees/${id}/documents/${key}/review`, body);
export const sendDocumentReminders  = (body)            => api.post(`${base}/document-reminders`, body);

// My Documents — a member of staff's own paperwork.
export const getMyDocuments    = ()           => api.get(`${base}/me/documents`);
export const uploadMyDocument  = (key, file)  => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`${base}/me/documents/${key}`, fd);
};

export const getResponsibilities   = (params) => api.get(`${base}/responsibilities`, { params });
export const createResponsibility  = (body)   => api.post(`${base}/responsibilities`, body);
export const removeResponsibility  = (id)     => api.delete(`${base}/responsibilities/${id}`);

export const listReports = ()             => api.get(`${base}/reports`);
export const getReport   = (type, params) => api.get(`${base}/reports/${type}`, { params });

// Exports stream a file, so they bypass the JSON axios instance and carry the
// token by hand.
export const exportReportUrl = (type, format, params = {}) => {
  const qs = new URLSearchParams({ ...params, format }).toString();
  return `${api.defaults.baseURL}${base}/reports/${type}?${qs}`;
};

export async function downloadReport(type, format, params = {}) {
  const res = await fetch(exportReportUrl(type, format, params), {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
