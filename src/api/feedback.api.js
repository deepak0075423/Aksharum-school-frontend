import api from './axios';

// ── Student ───────────────────────────────────────────────────────────────────
export const getStudentSummary   = ()   => api.get('/feedback/student/summary');
export const getPendingFeedback  = ()   => api.get('/feedback/student/pending');
export const getCompletedFeedback= ()   => api.get('/feedback/student/completed');
export const getFeedbackForm     = (id) => api.get(`/feedback/student/assignments/${id}`);
export const getMySubmission     = (id) => api.get(`/feedback/student/assignments/${id}/submission`);
export const submitFeedback      = (id, d) => api.post(`/feedback/student/assignments/${id}/submit`, d);

// ── Teacher (own results) ─────────────────────────────────────────────────────
export const getTeacherDashboard = (params) => api.get('/feedback/teacher/dashboard', { params });
export const getTeacherTrends    = (params) => api.get('/feedback/teacher/trends', { params });
export const getTeacherBreakdown = (params) => api.get('/feedback/teacher/breakdown', { params });

// ── Admin / Principal analytics ───────────────────────────────────────────────
export const getDashboard        = (params) => api.get('/feedback/dashboard', { params });
export const getMeta             = ()       => api.get('/feedback/meta');
export const getTeacherAnalytics = (id, params) => api.get(`/feedback/teachers/${id}`, { params });
export const getCampaignAnalytics= (id)     => api.get(`/feedback/campaigns/${id}/analytics`);
export const getReport           = (params) => api.get('/feedback/reports', { params });

// Report exports bypass the JSON interceptor — the response is a file.
export const reportExportUrl = (params) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null),
  ).toString();
  return `${import.meta.env.VITE_API_URL || '/api'}/feedback/reports?${qs}`;
};

// Downloads honour the Authorization header, so the file is fetched as a blob
// rather than opened in a new tab (which would drop the token).
export const downloadReport = async (params) => {
  const token = localStorage.getItem('token');
  const res = await fetch(reportExportUrl(params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = 'Export failed';
    try { message = (await res.json())?.message || message; } catch { /* binary/empty body */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const ext  = params.format === 'csv' ? 'csv' : params.format === 'pdf' ? 'pdf' : 'xlsx';
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `feedback_${params.type || 'report'}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const getCampaigns      = (params) => api.get('/feedback/campaigns', { params });
export const getCampaign       = (id)     => api.get(`/feedback/campaigns/${id}`);
export const createCampaign    = (d)      => api.post('/feedback/campaigns', d);
export const updateCampaign    = (id, d)  => api.put(`/feedback/campaigns/${id}`, d);
export const deleteCampaign    = (id)     => api.delete(`/feedback/campaigns/${id}`);
export const activateCampaign  = (id)     => api.post(`/feedback/campaigns/${id}/activate`);
export const closeCampaign     = (id)     => api.post(`/feedback/campaigns/${id}/close`);
export const archiveCampaign   = (id)     => api.post(`/feedback/campaigns/${id}/archive`);
export const duplicateCampaign = (id, d)  => api.post(`/feedback/campaigns/${id}/duplicate`, d);
export const syncAssignments   = (id)     => api.post(`/feedback/campaigns/${id}/sync`);
export const sendReminders     = (id)     => api.post(`/feedback/campaigns/${id}/reminders`);
export const getCampaignAssignments = (id, params) => api.get(`/feedback/campaigns/${id}/assignments`, { params });
export const reopenAssignment  = (id, d)  => api.post(`/feedback/assignments/${id}/reopen`, d);

// ── Question bank ─────────────────────────────────────────────────────────────
export const getQuestions   = (params) => api.get('/feedback/questions', { params });
export const createQuestion = (d)      => api.post('/feedback/questions', d);
export const updateQuestion = (id, d)  => api.put(`/feedback/questions/${id}`, d);
export const deleteQuestion = (id)     => api.delete(`/feedback/questions/${id}`);

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories   = (params) => api.get('/feedback/categories', { params });
export const createCategory  = (d)      => api.post('/feedback/categories', d);
export const updateCategory  = (id, d)  => api.put(`/feedback/categories/${id}`, d);
export const deleteCategory  = (id)     => api.delete(`/feedback/categories/${id}`);

// ── Templates ─────────────────────────────────────────────────────────────────
export const getTemplates   = ()      => api.get('/feedback/templates');
export const createTemplate = (d)     => api.post('/feedback/templates', d);
export const updateTemplate = (id, d) => api.put(`/feedback/templates/${id}`, d);
export const deleteTemplate = (id)    => api.delete(`/feedback/templates/${id}`);

// ── Settings & audit ──────────────────────────────────────────────────────────
export const getSettings    = ()  => api.get('/feedback/settings');
export const updateSettings = (d) => api.put('/feedback/settings', d);
export const seedDefaults   = ()  => api.post('/feedback/settings/seed');
export const getAuditLog    = (params) => api.get('/feedback/audit', { params });
