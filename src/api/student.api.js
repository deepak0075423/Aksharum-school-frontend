import api from './axios';
export const getDashboard    = () => api.get('/student/dashboard');
export const getModules      = () => api.get('/student/modules');
export const getSchoolConfig = () => api.get('/profile/school-config');
export const getMyClass     = () => api.get('/student/my-class');
// `week` (a YYYY-MM-DD inside the wanted week) picks which week's covers come back.
export const getTimetable        = (params) => api.get('/student/timetable', { params });
export const downloadTimetable   = () => api.get('/student/timetable/download', { responseType: 'blob' });
export const getMyAttendance   = (params) => api.get('/student/my-attendance', { params });
// Multipart when files are attached (FormData), JSON otherwise.
export const submitCorrection  = (data)   => api.post('/student/correction/submit', data);
export const getMyCorrections  = ()       => api.get('/student/correction');
export const replyCorrection   = (id, data) => api.post(`/student/correction/${id}/reply`, data);
// The registers of one day and my mark on each — what a correction can be about.
export const getAttendanceDay  = (params) => api.get('/student/attendance/day', { params });
// Month, year standing, alerts and requests in one answer (services/studentAttendanceView.js).
export const getAttendanceOverview = (params) => api.get('/student/attendance/overview', { params });
export const getClassRanking   = ()       => api.get('/student/attendance-ranking');
export const getExams       = () => api.get('/student/exams');
export const getAttempt     = (id) => api.get(`/student/exams/${id}/attempt`);
export const saveAnswer     = (id, data) => api.post(`/student/exams/${id}/save-answer`, data);
export const logViolation   = (id) => api.post(`/student/exams/${id}/violation`);
export const submitExam     = (id) => api.post(`/student/exams/${id}/submit`);
export const getExamResult  = (id) => api.get(`/student/exams/${id}/result`);
export const getDocuments       = () => api.get('/student/documents');
export const getDocument        = (id)   => api.get(`/student/documents/${id}`);
export const submitAssignment   = (id, data) => api.post(`/student/documents/${id}/submit`, data);
export const getHolidays    = () => api.get('/student/holidays');
export const getResults     = () => api.get('/student/results');
export const getResultDetail = (id) => api.get(`/student/results/${id}`);
export const getClassTests  = () => api.get('/student/results/class-tests');
