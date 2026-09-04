import api from './axios';
// `params` may carry { childId } — which child's detail block to build.
export const getDashboard    = (params) => api.get('/parent/dashboard', { params });
export const getModules      = () => api.get('/parent/modules');
export const getSchoolConfig = () => api.get('/profile/school-config');
export const getChildClass    = () => api.get('/parent/child-class');
export const getChildAttendance = (params) => api.get('/parent/child-attendance', { params });
export const getExams         = () => api.get('/parent/exams');
export const getResults       = () => api.get('/parent/results');
export const getResultDetail  = (id) => api.get(`/parent/results/${id}`);
export const getDocuments     = () => api.get('/parent/documents');
export const getHolidays      = () => api.get('/parent/holidays');
