import api from './axios';
export const getDashboard    = () => api.get('/teacher/dashboard');
export const getModules      = () => api.get('/teacher/modules');
export const getSchoolConfig = () => api.get('/profile/school-config');
export const getMySection   = () => api.get('/teacher/my-section');
// Every section this teacher is attached to — class teacher, vice, or subject
// teacher — which is exactly the set they may address a notification to.
export const getMySections  = () => api.get('/teacher/sections');
export const sendNotification = (data) => api.post('/teacher/notifications/send', data);
export const getTeacherSection = (id) => api.get(`/teacher/sections/${id}`);
export const createAnnouncement = (data) => api.post('/teacher/announcements', data);
export const deleteAnnouncement = (id) => api.delete(`/teacher/announcements/${id}`);
export const getAttendance  = (params) => api.get('/teacher/attendance', { params });
export const markAttendance = (data) => api.post('/teacher/attendance/mark', data);
export const getMyAttendance       = (params) => api.get('/teacher/my-attendance', { params });
export const clockIn               = ()       => api.post('/teacher/my-attendance/clock-in');
export const clockOut              = ()       => api.post('/teacher/my-attendance/clock-out');
export const submitRegularization  = (data)   => api.post('/teacher/regularization', data);
export const getMyRegularizations  = ()       => api.get('/teacher/regularization');
export const reviewCorrection      = (data)   => api.post('/teacher/correction-requests/review', data);
// Attendance workspace — registers are day-wise or subject-wise per the school's setting
export const getAttendanceCalendar = (params) => api.get('/teacher/attendance/calendar', { params });
export const getRecentRegisters    = (params) => api.get('/teacher/attendance/recent', { params });
export const getAttendanceRanking  = (params) => api.get('/teacher/attendance/ranking', { params });
export const getStudentCorrections = (params) => api.get('/teacher/attendance/corrections', { params });
export const createStudentCorrection = (data)  => api.post('/teacher/attendance/corrections', data);
export const requestCorrectionInfo = (id, data) => api.post(`/teacher/attendance/corrections/${id}/request-info`, data);
export const getTimetable          = (params) => api.get('/teacher/timetable', { params });
export const downloadTimetable     = ()       => api.get('/teacher/timetable/download', { responseType: 'blob' });
// `section` picks which of the teacher's sections to show; without it the
// server keeps its old behaviour of choosing the first one that has a timetable.
export const getClassTimetable     = (params) => api.get('/teacher/timetable/my-class', { params });
export const getExams       = () => api.get('/teacher/exams');
export const createExam     = (data) => api.post('/teacher/exams', data);
export const getExam        = (id) => api.get(`/teacher/exams/${id}`);
export const updateExam     = (id, data) => api.put(`/teacher/exams/${id}`, data);
export const deleteExam     = (id) => api.delete(`/teacher/exams/${id}`);
export const publishExam    = (id) => api.post(`/teacher/exams/${id}/publish`);
export const getQuestions   = (id) => api.get(`/teacher/exams/${id}/questions`);
export const addQuestion    = (id, data) => api.post(`/teacher/exams/${id}/questions`, data);
export const updateQuestion = (id, qid, data) => api.put(`/teacher/exams/${id}/questions/${qid}`, data);
export const deleteQuestion = (id, qid) => api.delete(`/teacher/exams/${id}/questions/${qid}`);
export const getSubmissions = (id) => api.get(`/teacher/exams/${id}/submissions`);
export const getAnalytics   = (id) => api.get(`/teacher/exams/${id}/analytics`);
export const getExamMeta          = ()   => api.get('/teacher/exams/meta');
export const getStudentResponse   = (id, studentId) => api.get(`/teacher/exams/${id}/submissions/${studentId}`);
export const getResultApproval    = (id) => api.get(`/teacher/exams/${id}/result-approval`);
export const subjectApproveResults= (id) => api.post(`/teacher/exams/${id}/subject-approve`);
export const approveResults       = (id, data) => api.post(`/teacher/exams/${id}/result-approval`, data);
// The landing page: every exam the teacher wrote or class-teaches, as rows, plus the tiles.
// `year`: '' / omitted = the current academic year, 'all', or a year id.
export const getExamBoard         = (params) => api.get('/teacher/exams/board', { params });
// Analytics over the exams this teacher can see, and one exam in depth.
export const getExamAnalytics     = (params) => api.get('/teacher/exams/analytics', { params });
export const getExamReport        = (id) => api.get(`/teacher/exams/${id}/report`);
export const importExamQuestions  = (id, file, preview) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/teacher/exams/${id}/questions/import`, fd, { params: preview ? { preview: '1' } : {} });
};
export const getExamQuestionTemplate = () => api.get('/teacher/exams/questions/template', { responseType: 'blob' });
// Accepts status, leaveType, mode, fromDate, toDate, page and limit. The reply
// carries `counts` — this teacher's whole history by status, unaffected by the
// filters, so the tiles above the list do not move when one is pressed.
export const getMyLeaves     = (params) => api.get('/teacher/leave', { params });
export const getLeaveBalance = ()       => api.get('/teacher/leave/balance');
export const applyLeave      = (data)   => api.post('/teacher/leave/apply', data);
export const cancelLeave     = (id)     => api.delete(`/teacher/leave/${id}`);

// The rules behind each leave type, and whether I qualify for it
export const getLeaveTypePolicies = ()          => api.get('/teacher/leave/policies');
// Designation-based approvers (e.g. Principal) work their queue here
export const getLeaveApprovals    = (params)    => api.get('/teacher/leave/approvals', { params });
export const approveLeaveRequest  = (id, data)  => api.post(`/teacher/leave/approvals/${id}/approve`, data);
export const rejectLeaveRequest   = (id, data)  => api.post(`/teacher/leave/approvals/${id}/reject`, data);

// Comp Off
export const getMyCompOff       = (params)   => api.get('/teacher/leave/compoff', { params });
export const previewCompOffDate = (params)   => api.get('/teacher/leave/compoff/preview', { params });
export const getMyCompOffLedger = ()         => api.get('/teacher/leave/compoff/ledger');
export const applyCompOff       = (data)     => api.post('/teacher/leave/compoff', data);
export const submitCompOffDraft = (id, data) => api.post(`/teacher/leave/compoff/${id}/apply`, data);
export const cancelCompOff      = (id)       => api.delete(`/teacher/leave/compoff/${id}`);
// Designation-based approvers (e.g. Principal) get their queue here
export const getCompOffApprovals = (params)   => api.get('/teacher/leave/compoff/approvals', { params });
export const approveCompOff      = (id, data) => api.post(`/teacher/leave/compoff/${id}/approve`, data);
export const rejectCompOff       = (id, data) => api.post(`/teacher/leave/compoff/${id}/reject`, data);
export const getDocumentCategories = () => api.get('/teacher/document-categories');
export const getDocuments          = (params) => api.get('/teacher/documents', { params });
export const uploadDocument      = (data)   => api.post('/teacher/documents', data);
export const getDocument         = (id)     => api.get(`/teacher/documents/${id}`);
export const updateDocument      = (id, data) => api.put(`/teacher/documents/${id}`, data);
export const deleteDocument      = (id)     => api.delete(`/teacher/documents/${id}`);
// One document, opened — the same four tabs the office gets, behind an access
// check: a teacher reads anything shared with them, writes only their own.
export const getAssignmentDetail    = (id, params) => api.get(`/teacher/documents/${id}/assignment`, { params });
export const getAssignmentAnalytics = (id)        => api.get(`/teacher/documents/${id}/assignment/analytics`);
export const reviewAssignment       = (id, studentId, data) => api.post(`/teacher/documents/${id}/submissions/${studentId}/review`, data);
export const remindAssignment       = (id, data)  => api.post(`/teacher/documents/${id}/remind`, data || {});
export const duplicateDocument      = (id)        => api.post(`/teacher/documents/${id}/duplicate`);
export const getDocumentComments    = (id, params) => api.get(`/teacher/documents/${id}/comments`, { params });
export const addDocumentComment     = (id, data)  => api.post(`/teacher/documents/${id}/comments`, data);
export const updateDocumentComment  = (cid, data) => api.patch(`/teacher/documents/comments/${cid}`, data);
export const deleteDocumentComment  = (cid)       => api.delete(`/teacher/documents/comments/${cid}`);
export const likeDocumentComment    = (cid)       => api.post(`/teacher/documents/comments/${cid}/like`);
export const getDocumentSubs     = (id)     => api.get(`/teacher/documents/${id}/submissions`);
export const reviewSubmission    = (subId, data) => api.post(`/teacher/documents/submissions/${subId}/review`, data);
export const getHolidays         = () => api.get('/teacher/holidays');
export const getClassHolidays    = () => api.get('/teacher/class-holidays');
export const getResultBoard   = () => api.get('/teacher/results/board');
export const getExamSchedule  = () => api.get('/teacher/results/schedule');
/** Report cards of the sections this teacher is class or vice class teacher of. */
export const getReportCards      = (params) => api.get('/teacher/results/report-cards', { params });
/** A filled-in marks file (Excel or CSV), read into rows for the marks grid to match. Nothing is saved. */
export const readMarksFile = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/teacher/results/marks-import', fd); };
/** Re-exam marks for the papers of this teacher's subjects, once the office has set up the re-exam. */
export const getReExam  = (examId) => api.get(`/teacher/results/exams/${examId}/re-exam`);
export const saveReExam = (examId, data) => api.put(`/teacher/results/exams/${examId}/re-exam`, data);
export const saveReportCardNotes = (data) => api.put('/teacher/results/report-cards/notes', data);
export const getReportCardsPdf   = (params) => api.get('/teacher/results/report-cards/pdf', { params, responseType: 'blob' });
export const getTestOptions   = () => api.get('/teacher/results/test-options');
export const getTeacherSheet  = (examId, subjectId) => api.get(`/teacher/results/sheets/${examId}/${subjectId}`);
export const getExamReview    = (examId) => api.get(`/teacher/results/review/${examId}`);
export const getSectionResults = (examId) => api.get(`/teacher/results/exams/${examId}/result`);
export const getTestSheet     = (id) => api.get(`/teacher/results/class-tests/${id}/sheet`);
// Oct 2026, the second audit.
export const getSheetHistory  = (examId, subjectId) => api.get(`/teacher/results/sheets/${examId}/${subjectId}/history`);
export const getElectives     = (params) => api.get('/teacher/results/electives', { params });
export const saveElective     = (data) => api.put('/teacher/results/electives', data);
export const releaseReportCards = (data) => api.post('/teacher/results/report-cards/release', data);
export const sendReportCards  = (data) => api.post('/teacher/results/report-cards/send', data);
// A class teacher's own section: the exam's marks register and its admit cards.
export const getMarksRegister = (examId) => api.get(`/teacher/results/exams/${examId}/register.xlsx`, { responseType: 'blob' });
export const getAdmitCards = (examId) => api.get(`/teacher/results/exams/${examId}/admit-cards.pdf`, { responseType: 'blob' });
export const deleteClassTest  = (id) => api.delete(`/teacher/results/class-tests/${id}`);
export const updateClassTest  = (id, data) => api.put(`/teacher/results/class-tests/${id}`, data);
export const reopenClassTest  = (id) => api.post(`/teacher/results/class-tests/${id}/reopen`);
export const approveClassTest = (id, data) => api.post(`/teacher/results/class-test-validation/${id}/approve`, data);
export const rejectClassTest  = (id, data) => api.post(`/teacher/results/class-test-validation/${id}/reject`, data);
export const getMarksEntry  = () => api.get('/teacher/results/marks-entry');
export const getMarksForm   = (examId, subjectId) => api.get(`/teacher/results/marks-entry/${examId}/${subjectId}`);
export const saveMarks      = (examId, subjectId, data) => api.post(`/teacher/results/marks-entry/${examId}/${subjectId}/save`, data);
export const getValidation        = () => api.get('/teacher/results/validation');
export const getValidationDetail  = (examId) => api.get(`/teacher/results/validation/${examId}`);
export const approveValidation    = (examId, data) => api.post(`/teacher/results/validation/${examId}/approve`, data);
export const rejectValidation     = (examId, data) => api.post(`/teacher/results/validation/${examId}/reject`, data);
export const getClassTests  = () => api.get('/teacher/results/class-tests');
export const createClassTest = (data) => api.post('/teacher/results/class-tests', data);
export const getTestMarks    = (id) => api.get(`/teacher/results/class-tests/${id}/marks`);
export const saveTestMarks   = (id, data) => api.post(`/teacher/results/class-tests/${id}/marks/save`, data);
