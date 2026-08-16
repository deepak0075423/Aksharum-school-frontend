import api from './axios';

// Student Analytics — one API for both school admins and teachers. The backend
// resolves the caller's scope (whole school vs. own sections) from the token, so
// the client never has to branch on role for data access.
export const getScope    = ()       => api.get('/analytics/scope');
export const getOverview = (params) => api.get('/analytics/overview', { params });
export const getStudents = (params) => api.get('/analytics/students', { params });
export const getStudentAnalytics = (id) => api.get(`/analytics/students/${id}`);
