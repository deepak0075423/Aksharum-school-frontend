import api from './axios';
// `params` may carry { childId } — which child's detail block to build.
export const getDashboard    = (params) => api.get('/parent/dashboard', { params });
export const getModules      = () => api.get('/parent/modules');
export const getSchoolConfig = () => api.get('/profile/school-config');
export const getChildClass    = () => api.get('/parent/child-class');
export const getChildAttendance = (params) => api.get('/parent/child-attendance', { params });
export const getChildAttendanceOverview = (params) => api.get('/parent/child-attendance/overview', { params });
export const getChildCorrections = (params) => api.get('/parent/child-attendance/requests', { params });
// `child` picks which child; the reply lists `children` to switch between.
export const getExams         = (params) => api.get('/parent/exams', { params });
export const getResults       = () => api.get('/parent/results');
export const getResultDetail  = (id) => api.get(`/parent/results/${id}`);
export const getDocuments     = () => api.get('/parent/documents');
export const getHolidays      = () => api.get('/parent/holidays');

// Teacher feedback — each child's progress through open campaigns. Status only, never answers.
export const getChildrenFeedback = () => api.get('/parent/feedback');
