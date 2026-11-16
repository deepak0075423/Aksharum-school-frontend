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
// The school's list of departments: add, rename (members follow), move staff
// from one to another (how two spellings are merged), remove an empty one.
export const createDepartment = (body)     => api.post(`${base}/departments`, body);
export const updateDepartment = (id, body) => api.put(`${base}/departments/${id}`, body);
export const moveDepartment   = (body)     => api.post(`${base}/departments/move`, body);
export const removeDepartment = (id)       => api.delete(`${base}/departments/${id}`);
export const getDesignations  = () => api.get(`${base}/designations`);
export const getOrgStructure  = () => api.get(`${base}/org-structure`);
export const getVerificationQueue = () => api.get(`${base}/verification`);

// One employee's record beyond the profile itself.
export const getAssignments       = (id, year) => api.get(`${base}/employees/${id}/assignments`, { params: year ? { year } : {} });
export const getHistory           = (id)       => api.get(`${base}/employees/${id}/history`);
export const updateQualifications = (id, list) => api.put(`${base}/employees/${id}/qualifications`, { qualifications: list });
export const bulkEmployment       = (body)     => api.put(`${base}/employees/bulk-employment`, body);
// A paper handed in at the desk — it is still reviewed like any other.
export const uploadEmployeeDocument = (id, key, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`${base}/employees/${id}/documents/${key}`, fd);
};

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
export const updateResponsibility  = (id, body) => api.put(`${base}/responsibilities/${id}`, body);
export const removeResponsibility  = (id)     => api.delete(`${base}/responsibilities/${id}`);

// "Please correct my details" — the employee asks, the office answers.
export const getMyRequests    = ()         => api.get(`${base}/me/requests`);
export const createMyRequest  = (body)     => api.post(`${base}/me/requests`, body);
export const getChangeRequests = (params)  => api.get(`${base}/change-requests`, { params });
export const closeChangeRequest = (id, body) => api.put(`${base}/change-requests/${id}`, body);

export const listReports = ()             => api.get(`${base}/reports`);
export const getReport   = (type, params) => api.get(`${base}/reports/${type}`, { params });

// Exports are files. They go through the same axios instance as everything
// else (so an expired session is refreshed rather than reported as "Export
// failed"), asked for as a blob, and handed to the browser to save.
function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadReport(type, format, params = {}) {
  const blob = await api.get(`${base}/reports/${type}`, { params: { ...params, format }, responseType: 'blob' });
  save(blob, `${type}-${new Date().toISOString().slice(0, 10)}.${format}`);
}

/** One employee's record as a PDF (government and bank numbers masked). */
export async function downloadProfilePdf(id, name = 'employee') {
  const blob = await api.get(`${base}/employees/${id}/profile.pdf`, { responseType: 'blob' });
  save(blob, `${String(name).trim().replace(/[^\w]+/g, '-').toLowerCase() || 'employee'}-profile.pdf`);
}
