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
/** One child's results — `childId`, or else the child `focus` (an exam or class test a notice was about) concerns. */
export const getResultsOverview = (childId, focus) => api.get('/parent/results/overview', {
  params: { ...(childId ? { childId } : {}), ...(!childId && focus ? { focus } : {}) },
});
export const getExamSchedule = (childId) => api.get('/parent/results/schedule', { params: childId ? { childId } : {} });
export const getReportCard = (childId, academicYear, term) => api.get('/parent/results/report-card', {
  params: { ...(childId ? { childId } : null), ...(academicYear ? { academicYear } : null), ...(term ? { term } : null) },
});
export const getReportCardPdf = (childId, academicYear, term) => api.get('/parent/results/report-card/pdf', {
  params: { ...(childId ? { childId } : null), ...(academicYear ? { academicYear } : null), ...(term ? { term } : null) }, responseType: 'blob',
});
/** Ask for a paper of one of the child's published results to be checked again. */
export const requestRecheck = (data) => api.post('/parent/results/recheck', data);
/** A child's admit card for an exam, once its timetable is shared. */
export const getAdmitCard = (childId, examId) => api.get('/parent/results/admit-card', { params: { examId, ...(childId ? { childId } : null) }, responseType: 'blob' });
export const getResults       = () => api.get('/parent/results');
export const getResultDetail  = (id) => api.get(`/parent/results/${id}`);
export const getDocuments     = () => api.get('/parent/documents');
export const getHolidays      = () => api.get('/parent/holidays');

// Timetable — one child's week. `child` picks which; the reply lists `children`
// to switch between, and always names the child it answered for.
export const getTimetable      = (params) => api.get('/parent/timetable', { params });
export const downloadTimetable = (params) => api.get('/parent/timetable/download', { params, responseType: 'blob' });

// Teacher feedback — each child's progress through open campaigns. Status only, never answers.
export const getChildrenFeedback = () => api.get('/parent/feedback');
