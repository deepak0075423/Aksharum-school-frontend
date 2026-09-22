import api from './axios';

/** Drop empty values so a cleared filter does not travel as `?department=`. */
const qs = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ── Admin: shell ──────────────────────────────────────────────────────────────
export const getOverview   = (p) => api.get(`/payroll/admin/overview${qs(p)}`);
export const getDashboard  = () => api.get('/payroll/admin/dashboard');
export const getEmployees  = (p) => api.get(`/payroll/admin/employees${qs(p)}`);
export const getSettings   = () => api.get('/payroll/admin/settings');
export const updateSettings = (data) => api.put('/payroll/admin/settings', data);
export const getAuditLog   = (p) => api.get(`/payroll/admin/audit${qs(p)}`);

// ── Salary structures ─────────────────────────────────────────────────────────
export const getStructures     = (p) => api.get(`/payroll/admin/structures${qs(p)}`);
export const getLibrary        = () => api.get('/payroll/admin/structures/library');
export const previewStructure  = (data) => api.post('/payroll/admin/structures/preview', data);
export const createFromTemplate = (data) => api.post('/payroll/admin/structures/template', data);
export const createStructure   = (data) => api.post('/payroll/admin/structures', data);
export const updateStructure   = (id, data) => api.put(`/payroll/admin/structures/${id}`, data);
export const deleteStructure   = (id) => api.delete(`/payroll/admin/structures/${id}`);
export const toggleStructure   = (id, data) => api.patch(`/payroll/admin/structures/${id}/toggle`, data || {});
export const setDefaultStructure = (id) => api.patch(`/payroll/admin/structures/${id}/default`, {});
export const duplicateStructure  = (id, data) => api.post(`/payroll/admin/structures/${id}/duplicate`, data || {});

// ── Assignments ───────────────────────────────────────────────────────────────
export const getAssignments   = (p) => api.get(`/payroll/admin/assignments${qs(p)}`);
export const getAssignment    = (id) => api.get(`/payroll/admin/assignments/${id}`);
export const assignEmployee   = (data) => api.post('/payroll/admin/assignments', data);
export const bulkAssign       = (data) => api.post('/payroll/admin/assignments/bulk', data);
export const copyAssignments  = (data) => api.post('/payroll/admin/assignments/copy', data);
export const updateAssignment = (id, data) => api.put(`/payroll/admin/assignments/${id}`, data);
export const deleteAssignment = (id) => api.delete(`/payroll/admin/assignments/${id}`);
export const deactivateAssignment = (id, data) => api.patch(`/payroll/admin/assignments/${id}/deactivate`, { ...(data || {}), isActive: false });
export const activateAssignment   = (id, data) => api.patch(`/payroll/admin/assignments/${id}/activate`, { ...(data || {}), isActive: true });
export const updateCtc        = (id, data) => api.put(`/payroll/admin/assignments/${id}/ctc`, data);
export const getCtcHistory    = (id) => api.get(`/payroll/admin/assignments/${id}/ctc-history`);

// ── Payroll runs ──────────────────────────────────────────────────────────────
export const getPayrollRuns = (p) => api.get(`/payroll/admin/runs${qs(p)}`);
export const getRunDetail   = (id, p) => api.get(`/payroll/admin/runs/${id}${qs(p)}`);
export const createRun      = (data) => api.post('/payroll/admin/runs', data);
export const recomputeRun   = (id, data) => api.post(`/payroll/admin/runs/${id}/recompute`, data || {});
export const updateRunStatus = (id, status) => api.patch(`/payroll/admin/runs/${id}/status`, { status });
export const publishRun     = (id) => api.post(`/payroll/admin/runs/${id}/publish`, {});
export const unpublishRun   = (id) => api.post(`/payroll/admin/runs/${id}/unpublish`, {});
export const cancelRun      = (id, data) => api.patch(`/payroll/admin/runs/${id}/cancel`, data || {});
export const deleteRun      = (id) => api.delete(`/payroll/admin/runs/${id}`);
export const updateRunEntry = (id, entryId, data) => api.put(`/payroll/admin/runs/${id}/entries/${entryId}`, data);
export const holdRunEntry   = (id, entryId, data) => api.patch(`/payroll/admin/runs/${id}/entries/${entryId}/hold`, data || {});
export const exportRun      = (id) => api.get(`/payroll/admin/runs/${id}/export`, { responseType: 'blob' });
export const getBankFile    = (id) => api.get(`/payroll/admin/runs/${id}/bank-file`, { responseType: 'blob' });
export const adminDownloadPayslip = (id) => api.get(`/payroll/admin/payslips/${id}/download`, { responseType: 'blob' });

// ── Advances and loans ────────────────────────────────────────────────────────
export const getAdvances   = (p) => api.get(`/payroll/admin/advances${qs(p)}`);
export const createAdvance = (data) => api.post('/payroll/admin/advances', data);
export const closeAdvance  = (id, data) => api.patch(`/payroll/admin/advances/${id}/close`, data || {});

// ── Reimbursement claims ──────────────────────────────────────────────────────
export const getClaims   = (p) => api.get(`/payroll/admin/claims${qs(p)}`);
export const createClaim = (data) => api.post('/payroll/admin/claims', data);
export const decideClaim = (id, data) => api.patch(`/payroll/admin/claims/${id}`, data);
export const deleteClaim = (id) => api.delete(`/payroll/admin/claims/${id}`);

// ── Full and final settlement ─────────────────────────────────────────────────
export const getSettlement   = (id, p) => api.get(`/payroll/admin/assignments/${id}/settlement${qs(p)}`);
export const applySettlement = (id, data) => api.post(`/payroll/admin/assignments/${id}/settlement`, data);

// ── Reports ───────────────────────────────────────────────────────────────────
export const getReportsOverview = (p) => api.get(`/payroll/admin/reports/overview${qs(p)}`);
export const getReports      = (p) => api.get(`/payroll/admin/reports${qs(p)}`);
export const generateReport  = (data) => api.post('/payroll/admin/reports', data);
export const downloadReport  = (id) => api.get(`/payroll/admin/reports/${id}/download`, { responseType: 'blob' });
export const deleteReport    = (id) => api.delete(`/payroll/admin/reports/${id}`);

// ── Teacher ───────────────────────────────────────────────────────────────────
export const getMyCtc       = () => api.get('/payroll/me/ctc');
export const getMyPayslips  = (p) => api.get(`/payroll/me/payslips${qs(p)}`);
export const getPayslipDetail    = (id) => api.get(`/payroll/me/payslips/${id}`);
export const downloadMyPayslip   = (id) => api.get(`/payroll/me/payslips/${id}/download`, { responseType: 'blob' });
export const downloadMyStatement = (p) => api.get(`/payroll/me/statement${qs(p)}`, { responseType: 'blob' });
