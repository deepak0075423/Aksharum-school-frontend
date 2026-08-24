import api from './axios';

export const getDashboard = () => api.get('/admin/dashboard');
export const getModules   = () => api.get('/admin/modules');

// School Settings
export const getSchoolSettings    = ()   => api.get('/admin/school-settings');
export const updateSchoolSettings = (fd) => api.put('/admin/school-settings', fd);
export const getSchoolConfig      = ()   => api.get('/profile/school-config');

// SMTP Settings (per-school outgoing email)
export const getSmtpSettings    = ()     => api.get('/admin/smtp-settings');
export const updateSmtpSettings = (data) => api.put('/admin/smtp-settings', data);
export const testSmtpSettings   = (to)   => api.post('/admin/smtp-settings/test', { to });

// Payment gateway — school-level, shared by every module that takes money
export const getPaymentGateway    = ()     => api.get('/admin/payment-gateway');
export const updatePaymentGateway = (data) => api.put('/admin/payment-gateway', data);

// Receipt designs, per module and payment mode
export const getReceiptTemplates   = (module) => api.get('/admin/receipt-templates', { params: { module } });
export const updateReceiptTemplate = (data)   => api.put('/admin/receipt-templates', data);
/**
 * Fetches the rendered preview as HTML. Deliberately not a URL for an <iframe
 * src>: the endpoint is bearer-authenticated and an iframe sends no token, so
 * the frame would load a 401 page. The caller puts this in `srcDoc` instead.
 */
export const fetchReceiptPreview = async (params) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  const res = await fetch(`${api.defaults.baseURL}/admin/receipt-templates/preview?${qs}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!res.ok) throw new Error('Could not build the preview');
  return res.text();
};

// Users
export const getTeachers = (params) => api.get('/admin/teachers', { params });
export const getDesignations    = () => api.get('/admin/designations');
export const updateDesignations = (designations) => api.put('/admin/designations', { designations });

// Designation module permissions. getDesignationMatrix returns
// { designations[], modules[], enabledModules[], levels[] } — see
// controllers/designation.controller.js.
export const getDesignationMatrix    = ()             => api.get('/admin/designations/matrix');
export const saveDesignationMatrix   = (designations) => api.put('/admin/designations/matrix', { designations });
export const createDesignation       = (data)         => api.post('/admin/designations', data);
export const updateDesignation       = (id, data)     => api.put(`/admin/designations/${id}`, data);
export const deleteDesignation       = (id)           => api.delete(`/admin/designations/${id}`);
export const getDesignationTeachers  = (id)           => api.get(`/admin/designations/${id}/teachers`);
export const exportDesignationTeachers = (id) =>
  api.get(`/admin/designations/${id}/teachers/export`, { responseType: 'arraybuffer' });
export const getTeacher  = (id) => api.get(`/admin/teachers/${id}`);
export const createTeacher = (data) => api.post('/admin/teachers', data);
// The full record, edited with the same wizard. Multipart: uploads are optional
// on an edit, and anything already on file is kept.
export const updateTeacherFull = (id, data) => api.put(`/admin/teachers/${id}`, data);
export const getTeacherDetail  = (id) => api.get(`/admin/teachers/${id}`);
export const deleteTeacher = (id) => api.delete(`/admin/teachers/${id}`);
export const updateTeacher  = (id, data) => api.put(`/admin/users/${id}`, data);
export const toggleTeacher  = (id)       => api.patch(`/admin/users/${id}/toggle`);

export const checkEmail            = (email) => api.get('/admin/users/check-email', { params: { email } });
export const getClassesWithSections = (all) => api.get('/admin/classes-with-sections', all ? { params: { all: 'true' } } : {});
export const getStudents = (params) => api.get('/admin/students', { params });
export const getStudent  = (id) => api.get(`/admin/students/${id}`);
export const createStudent = (data) => api.post('/admin/students', data);
// The full admission intake posts multipart (certificates + ID scans). Up to 20
// uploads can ride along, so it gets a longer timeout than the 30s default.
const UPLOAD_TIMEOUT = { timeout: 120000 };
export const createStudentForm = (fd)     => api.post('/admin/students', fd, UPLOAD_TIMEOUT);
export const updateStudentForm = (id, fd) => api.put(`/admin/students/${id}`, fd, UPLOAD_TIMEOUT);
export const deleteStudent = (id) => api.delete(`/admin/students/${id}`);
export const parentLookup  = (q)      => api.get('/admin/students/parent-lookup', { params: { q } });
export const pincodeLookup = (pin)    => api.get(`/admin/pincode/${pin}`);
export const previewAdmissionNumber = (format) => api.get('/admin/admission-number/preview', { params: format ? { format } : {} });
export const previewEmployeeId      = (format) => api.get('/admin/employee-id/preview', { params: format ? { format } : {} });
export const updateStudent  = (id, data) => api.put(`/admin/students/${id}`, data);
export const toggleStudent  = (id)       => api.patch(`/admin/users/${id}/toggle`);
export const bulkImportStudents        = (fd) => api.post('/admin/students/bulk', fd);
export const bulkImportTeachers        = (fd) => api.post('/admin/teachers/bulk', fd);
export const downloadTeacherTemplate   = ()   => api.get('/admin/teachers/template', { responseType: 'arraybuffer' });
export const downloadStudentTemplate   = ()   => api.get('/admin/students/template', { responseType: 'arraybuffer' });

export const getAdmins = (params) => api.get('/admin/admins', { params });
export const createAdmin = (data) => api.post('/admin/admins', data);
export const deleteAdmin = (id) => api.delete(`/admin/admins/${id}`);

// Academic Years
export const getAcademicYears    = () => api.get('/admin/academic-years');
export const createAcademicYear  = (data) => api.post('/admin/academic-years', data);
export const updateAcademicYear  = (id, data) => api.put(`/admin/academic-years/${id}`, data);
export const deleteAcademicYear  = (id) => api.delete(`/admin/academic-years/${id}`);
export const setActiveYear       = (id) => api.patch(`/admin/academic-years/${id}/set-active`);

// Classes
export const getClasses     = (params) => api.get('/admin/classes', { params });
export const createClass    = (data) => api.post('/admin/classes', data);
export const getClassDetail = (id) => api.get(`/admin/classes/${id}`);
export const updateClass    = (id, data) => api.put(`/admin/classes/${id}`, data);
export const deleteClass          = (id) => api.delete(`/admin/classes/${id}`);
export const autoAssignStudents   = (academicYear) => api.post('/admin/classes/auto-assign', academicYear ? { academicYear } : {});
export const createSection        = (classId, data) => api.post(`/admin/classes/${classId}/sections`, data);
// What the shuffle would do, before anything moves: how many students, how many
// seats across the sections, and the reason when it cannot be done.
export const shufflePreview       = (classId) => api.get(`/admin/classes/${classId}/shuffle-preview`);
export const shuffleSections      = (classId) => api.post(`/admin/classes/${classId}/shuffle-sections`);
export const lockSectionShuffle   = (classId) => api.post(`/admin/classes/${classId}/lock-sections`);

// Sections
export const getSectionDetail = (id) => api.get(`/admin/sections/${id}`);
export const updateSectionTeacher = (id, data) => api.put(`/admin/sections/${id}/teachers`, data);
export const deleteSection  = (id) => api.delete(`/admin/sections/${id}`);
export const getSectionSubjectTeachers  = (id) => api.get(`/admin/sections/${id}/subjects`);
export const getAssignableStudents      = (sectionId, params) => api.get(`/admin/sections/${sectionId}/assignable-students`, { params });
export const assignStudentsToSection    = (sectionId, studentIds) => api.post(`/admin/sections/${sectionId}/assign-student`, { studentIds });
export const assignStudentToSection     = (sectionId, studentId) => api.post(`/admin/sections/${sectionId}/assign-student`, { studentId });
export const removeStudentFromSection   = (sectionId, studentId) => api.delete(`/admin/sections/${sectionId}/remove-student`, { data: { studentId } });
export const assignSectionSubjectTeacher  = (id, data)                 => api.post(`/admin/sections/${id}/subjects/assign`, data);
export const removeSectionSubjectTeacher  = (id, subjectId, teacherId) => api.delete(`/admin/sections/${id}/subjects/${subjectId}/teachers/${teacherId}`);
export const getSectionTeacherOptions     = (id) => api.get(`/admin/sections/${id}/teacher-options`);
export const assignSectionRollNumbers     = (id) => api.post(`/admin/sections/${id}/assign-roll-numbers`);
export const updateStudentRollNumber      = (sectionId, studentId, rollNumber) =>
  api.put(`/admin/sections/${sectionId}/students/${studentId}/roll-number`, { rollNumber });
export const getSectionChatGroup          = (id) => api.get(`/admin/sections/${id}/chat-group`);
export const syncSectionChatGroup         = (id) => api.post(`/admin/sections/${id}/chat-group`);

// Subjects
export const getSubjects   = () => api.get('/admin/subjects');
export const createSubject = (data) => api.post('/admin/subjects', data);
export const updateSubject = (id, data) => api.put(`/admin/subjects/${id}`, data);
export const deleteSubject = (id) => api.delete(`/admin/subjects/${id}`);

// Leave
export const getLeaveTypes          = ()         => api.get('/admin/leave/types');
export const createLeaveType        = (data)     => api.post('/admin/leave/types', data);
export const updateLeaveType        = (id, data) => api.put(`/admin/leave/types/${id}`, data);
export const deleteLeaveType        = (id)       => api.delete(`/admin/leave/types/${id}`);
// What a delete would take with it — teachers holding days of this type, plus
// anything that blocks the delete outright. Powers the delete confirm popup.
export const getLeaveTypeImpact     = (id)       => api.get(`/admin/leave/types/${id}/impact`);
export const updateLeaveSettings    = (data)     => api.put('/admin/leave/settings', data);
export const getLeaveRequests       = (params)   => api.get('/admin/leave/requests', { params });
export const adminApplyLeave        = (data)     => api.post('/admin/leave/requests', data);
export const getTeacherLeaveBalance = (teacherId) => api.get('/admin/leave/balance', { params: { teacherId } });
// Balance for the picked type + what the picked dates will actually cost
export const getLeaveApplyPreview   = (params)   => api.get('/admin/leave/apply-preview', { params });
export const approveLeave           = (id, data) => api.post(`/admin/leave/requests/${id}/approve`, data);
export const rejectLeave            = (id, data) => api.post(`/admin/leave/requests/${id}/reject`, data);
export const requestLeaveModification = (id, data) => api.post(`/admin/leave/requests/${id}/modification`, data);
export const getLeaveAllocations    = (params)   => api.get('/admin/leave/allocations', { params });
export const allocateLeave          = (data)     => api.post('/admin/leave/allocations', data);
// Zeroes allocated + carried-forward days, keeping used/pending history
export const clearLeaveAllocations  = (data)     => api.post('/admin/leave/allocations/clear', data);
export const runLeaveAccrual        = ()         => api.post('/admin/leave/accrual/run');
export const downloadAllocationTemplate = ()     => api.get('/admin/leave/allocations/template', { responseType: 'arraybuffer' });
export const bulkAllocateLeaveExcel = (fd)       => api.post('/admin/leave/allocations/excel', fd);
export const runCarryForward        = (data)     => api.post('/admin/leave/allocations/carry-forward', data);
// Year-end: lapse whatever carry-forward did not move
export const getYearClosePreview    = (params)   => api.get('/admin/leave/year-close/preview', { params });
export const closeAcademicYear      = (data)     => api.post('/admin/leave/year-close', data);
// Final settlement for someone leaving
export const settleEmployeeLeave    = (data)     => api.post('/admin/leave/settle', data);
export const exportLeaveRequests    = (params)   => api.get('/admin/leave/requests/export',    { params, responseType: 'arraybuffer' });
export const exportLeaveAllocations = (params)   => api.get('/admin/leave/allocations/export', { params, responseType: 'arraybuffer' });
export const getLeaveReports        = (params)   => api.get('/admin/leave/reports', { params });
export const exportLeaveReports     = (params)   => api.get('/admin/leave/reports/export', { params, responseType: 'arraybuffer' });
export const reverseApprovedLeave   = (id, data) => api.post(`/admin/leave/requests/${id}/reverse`, data);

// Per-leave-type policies — every leave type carries its own rule set
export const getLeavePolicies   = ()             => api.get('/admin/leave/policies');
export const getLeavePolicy     = (leaveTypeId)  => api.get(`/admin/leave/policies/${leaveTypeId}`);
export const updateLeavePolicy  = (leaveTypeId, data) => api.put(`/admin/leave/policies/${leaveTypeId}`, data);

// Comp Off — part of the leave module, gated by the same module flag
export const getCompOffRequests   = (params)   => api.get('/admin/leave/compoff', { params });
export const applyCompOffFor      = (data)     => api.post('/admin/leave/compoff', data);
export const approveCompOff       = (id, data) => api.post(`/admin/leave/compoff/${id}/approve`, data);
export const rejectCompOff        = (id, data) => api.post(`/admin/leave/compoff/${id}/reject`, data);
export const cancelCompOff        = (id, data) => api.post(`/admin/leave/compoff/${id}/cancel`, data);
export const getCompOffPolicy     = ()         => api.get('/admin/leave/compoff/policy');
export const updateCompOffPolicy  = (data)     => api.put('/admin/leave/compoff/policy', data);
export const getCompOffLedger     = (params)   => api.get('/admin/leave/compoff/ledger', { params });
export const getCompOffBalances   = (params)   => api.get('/admin/leave/compoff/balances', { params });
export const getCompOffReports    = (params)   => api.get('/admin/leave/compoff/reports', { params });
export const exportCompOff        = (params)   => api.get('/admin/leave/compoff/export', { params, responseType: 'arraybuffer' });
export const previewCompOffDate   = (params)   => api.get('/admin/leave/compoff/preview', { params });
export const getCompOffEmployees  = ()         => api.get('/admin/leave/compoff/employees');
export const adjustCompOff        = (data)     => api.post('/admin/leave/compoff/adjust', data);
export const runCompOffExpiry     = ()         => api.post('/admin/leave/compoff/expire/run');
export const generateCompOffDrafts = (data)    => api.post('/admin/leave/compoff/generate', data);

// Timetable
export const getSectionTimetable         = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable`, { params: yearId ? { yearId } : {} });
export const saveTimetableStructure      = (sectionId, data)   => api.put(`/admin/sections/${sectionId}/timetable/structure`, data);
export const getSectionEntries           = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable/entries`, { params: yearId ? { yearId } : {} });
export const saveTimetableEntries        = (sectionId, data)   => api.put(`/admin/sections/${sectionId}/timetable/entries`, data);
export const getTimetableTeachers        = (params)            => api.get('/admin/timetable/teachers', { params });
export const downloadSectionTimetable    = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable/download`, { params: yearId ? { yearId } : {}, responseType: 'blob' });
export const downloadAllTimetables       = (params)            => api.get('/admin/timetable/download-all', { params, responseType: 'blob' });

// Documents
export const getDocuments    = (params)     => api.get('/admin/documents', { params });
export const getDocument     = (id)         => api.get(`/admin/documents/${id}`);
export const uploadDocument  = (data)       => api.post('/admin/documents', data);
export const updateDocument  = (id, data)   => api.put(`/admin/documents/${id}`, data);
export const deleteDocument  = (id)         => api.delete(`/admin/documents/${id}`);
export const archiveDocument = (id)         => api.post(`/admin/documents/${id}/archive`);
// Document Categories
export const getDocumentCategories    = ()       => api.get('/admin/document-categories');
export const createDocumentCategory   = (data)   => api.post('/admin/document-categories', data);
export const deleteDocumentCategory   = (id)     => api.delete(`/admin/document-categories/${id}`);

// Holidays
export const getHolidayTypes        = ()         => api.get('/admin/holiday-types');
export const updateHolidayTypes     = (holidayTypes) => api.put('/admin/holiday-types', { holidayTypes });
export const getHolidays            = ()         => api.get('/admin/holidays');
export const getMyHolidays          = ()         => api.get('/admin/holidays/mine');
export const createHoliday          = (data)     => api.post('/admin/holidays', data);
export const updateHoliday          = (id, data) => api.put(`/admin/holidays/${id}`, data);
export const deleteHoliday          = (id)       => api.delete(`/admin/holidays/${id}`);
export const importHolidays         = (fd)       => api.post('/admin/holidays/import', fd).then(r => r.data ?? r);
export const exportHolidays         = ()         => api.get('/admin/holidays/export',   { responseType: 'arraybuffer' }).then(r => r.data ?? r);
export const downloadHolidayTemplate= ()         => api.get('/admin/holidays/template', { responseType: 'arraybuffer' }).then(r => r.data ?? r);
export const getHolidayAuditLog     = (params)   => api.get('/admin/holidays/audit', { params });

// Aptitude Exams (overview)
export const getExams = (params) => api.get('/admin/exams', { params });

// Results
export const getFormalExams = (params) => api.get('/admin/results/exams', { params });
export const createFormalExam = (data) => api.post('/admin/results/exams', data);
export const getFormalExam  = (id) => api.get(`/admin/results/exams/${id}`);
export const updateFormalExam  = (id, data) => api.put(`/admin/results/exams/${id}`, data);
export const deleteFormalExam  = (id) => api.delete(`/admin/results/exams/${id}`);
export const approveFormalExam = (id) => api.post(`/admin/results/exams/${id}/approve`);
export const rejectFormalExam  = (id, data) => api.post(`/admin/results/exams/${id}/reject`, data);
export const reopenFormalExam  = (id, data) => api.post(`/admin/results/exams/${id}/reopen`, data);
export const getMarksReview    = (id) => api.get(`/admin/results/exams/${id}/marks-review`);
export const getResultSectionSubjects = (sectionId) => api.get(`/admin/results/sections/${sectionId}/subjects`);

// Notifications
export const sendNotification = (data) => api.post('/admin/notifications/send', data);
export const getNotifications  = () => api.get('/admin/notifications');

// Attendance
export const getRegularizationRequests = (params) => api.get('/admin/regularization-requests', { params });
export const reviewRegularization = (data) => api.post('/admin/regularization-requests/review', data);
export const getMyAttendance  = (params) => api.get('/admin/my-attendance', { params });
export const clockIn          = ()       => api.post('/admin/my-attendance/clock-in');
export const clockOut         = ()       => api.post('/admin/my-attendance/clock-out');
export const submitRegularization = (data) => api.post('/admin/regularization', data);
export const regularizeStaffAttendance = (data) => api.post('/admin/regularization/apply', data);
export const searchRegularizePeople = (params) => api.get('/admin/regularization/people', { params });
export const regularizeStudentAttendance = (data) => api.post('/admin/regularization/student', data);
export const getMyRegularizations = ()     => api.get('/admin/regularization');
