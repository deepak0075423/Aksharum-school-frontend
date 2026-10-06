// Medical Room — the staff's screens, a teacher's page and the family's page.
// See school-backend routes/api/medical.js.
import api from './axios';

const form = (file, fields = {}) => {
  const fd = new FormData();
  if (file) fd.append('file', file);
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return fd;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };

// ── Medical staff ────────────────────────────────────────────────────────────
export const getMedOverview = () => api.get('/medical/admin/overview');
export const getMedMeta = () => api.get('/medical/admin/meta');
export const getMedBoard = (screen, params) => api.get(`/medical/admin/board/${screen}`, { params });
export const searchMedical = (q) => api.get('/medical/admin/search', { params: { q } });
export const getMedAlerts = () => api.get('/medical/admin/alerts');
export const getMedRoom = (room) => api.get('/medical/admin/room', { params: room ? { room } : undefined });

export const findMedStudents = (q, limit = 20) => api.get('/medical/admin/students', { params: { q, limit } });
export const getMedStudent = (id) => api.get(`/medical/admin/students/${id}`);
export const getMedHistory = (id, params) => api.get(`/medical/admin/students/${id}/history`, { params });
export const getMedEmergency = (id) => api.get(`/medical/admin/students/${id}/emergency`);
export const getMedStudentDocs = (id) => api.get(`/medical/admin/students/${id}/documents`);
export const saveMedProfile = (id, body) => api.put(`/medical/admin/students/${id}/profile`, body);

export const addAllergy = (studentId, body) => api.post(`/medical/admin/students/${studentId}/allergies`, body);
export const updateAllergy = (id, body) => api.put(`/medical/admin/allergies/${id}`, body);
export const addCondition = (studentId, body) => api.post(`/medical/admin/students/${studentId}/conditions`, body);
export const updateCondition = (id, body) => api.put(`/medical/admin/conditions/${id}`, body);
export const addVaccination = (studentId, body) => api.post(`/medical/admin/students/${studentId}/vaccinations`, body);
export const updateVaccination = (id, body) => api.put(`/medical/admin/vaccinations/${id}`, body);
export const vaccinationGiven = (id, body) => api.post(`/medical/admin/vaccinations/${id}/given`, body);
export const addCheckup = (studentId, body) => api.post(`/medical/admin/students/${studentId}/checkups`, body);
export const scheduleCheckups = (body) => api.post('/medical/admin/checkups/schedule', body);
export const saveCheckupSheet = (body) => api.post('/medical/admin/checkups/sheet', body);
export const getCheckupSession = (sessionId) => api.get(`/medical/admin/checkups/sessions/${sessionId}`);
export const recordCheckup = (id, body) => api.put(`/medical/admin/checkups/${id}`, body);
export const cancelCheckup = (id, body) => api.post(`/medical/admin/checkups/${id}/cancel`, body);
export const uploadMedDocument = (studentId, file, fields) => api.post(`/medical/admin/students/${studentId}/documents`, form(file, fields), multipart);
export const updateMedDocument = (id, body) => api.put(`/medical/admin/documents/${id}`, body);
export const reviewMedDocument = (id, body) => api.post(`/medical/admin/documents/${id}/review`, body);
/** kind: allergies | conditions | vaccinations | checkups | documents */
export const verifyMedRecord = (kind, id) => api.post(`/medical/admin/records/${kind}/${id}/verify`, {});
export const archiveMedRecord = (kind, id, reason) => api.post(`/medical/admin/records/${kind}/${id}/archive`, { reason });
export const restoreMedRecord = (kind, id) => api.post(`/medical/admin/records/${kind}/${id}/restore`, {});

export const acceptMedRequest = (id, body) => api.post(`/medical/admin/requests/${id}/accept`, body || {});
export const arriveMedRequest = (id, body) => api.post(`/medical/admin/requests/${id}/arrive`, body || {});
export const cancelMedRequest = (id, body) => api.post(`/medical/admin/requests/${id}/cancel`, body);

export const createVisit = (body) => api.post('/medical/admin/visits', body);
export const getVisit = (id) => api.get(`/medical/admin/visits/${id}`);
export const updateVisit = (id, body) => api.put(`/medical/admin/visits/${id}`, body);
export const setVisitStatus = (id, body) => api.post(`/medical/admin/visits/${id}/status`, body);
// Sent home: the people on record who may collect the student, and who did.
export const getVisitCollectors = (id) => api.get(`/medical/admin/visits/${id}/collectors`);
export const recordVisitCollection = (id, body) => api.post(`/medical/admin/visits/${id}/collection`, body);
// Readings, triage, protocols and the body map.
export const getCareLibrary = () => api.get('/medical/admin/care-library');
export const addVisitReading = (id, body) => api.post(`/medical/admin/visits/${id}/readings`, body);
export const strikeVisitReading = (id, rid, reason) => api.post(`/medical/admin/visits/${id}/readings/${rid}/strike`, { reason });
export const setVisitTriage = (id, body) => api.post(`/medical/admin/visits/${id}/triage`, body);
export const setVisitProtocol = (id, body) => api.post(`/medical/admin/visits/${id}/protocol`, body);
export const setVisitInjuries = (id, injuries) => api.put(`/medical/admin/visits/${id}/injuries`, { injuries });
export const setIncidentInjuries = (id, injuries) => api.put(`/medical/admin/incidents/${id}/injuries`, { injuries });
// Restrictions and return to school.
export const getExclusionRules = () => api.get('/medical/admin/exclusion-rules');
export const addRestriction = (studentId, body) => api.post(`/medical/admin/students/${studentId}/restrictions`, body);
export const updateRestriction = (id, body) => api.put(`/medical/admin/restrictions/${id}`, body);
export const endRestriction = (id, note) => api.post(`/medical/admin/restrictions/${id}/end`, { note });
export const addExclusion = (studentId, body) => api.post(`/medical/admin/students/${studentId}/exclusions`, body);
export const clearExclusion = (id, body) => api.post(`/medical/admin/exclusions/${id}/clear`, body);
export const cancelExclusion = (id, reason) => api.post(`/medical/admin/exclusions/${id}/cancel`, { reason });
export const uploadExclusionCertificate = (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/medical/admin/exclusions/${id}/certificate`, fd); };
// Consent, the family's own medicine, counting the shelf.
export const recordPaperConsent = (studentId, body) => api.post(`/medical/admin/students/${studentId}/consent`, body);
export const withdrawConsentAdmin = (id, reason) => api.post(`/medical/admin/consents/${id}/withdraw`, { reason });
export const requestConsents = (body) => api.post('/medical/admin/consents/request', body || {});
export const recordPlanSupply = (id, body) => api.post(`/medical/admin/plans/${id}/supply`, body);
export const countMedItem = (id, body) => api.post(`/medical/admin/items/${id}/count`, body);
// Places, reorder, costs, disposal, the fridge.
export const getPlaces = (params) => api.get('/medical/admin/places', { params });
export const addPlace = (body) => api.post('/medical/admin/places', body);
export const updatePlace = (id, body) => api.put(`/medical/admin/places/${id}`, body);
export const checkPlace = (id, note) => api.post(`/medical/admin/places/${id}/check`, { note });
export const getPlaceStock = (id) => api.get(`/medical/admin/places/${id}/stock`);
export const transferStock = (body) => api.post('/medical/admin/stock/transfer', body);
export const getReorder = (params) => api.get('/medical/admin/reorder', { params });
export const raiseReorderRequest = (body) => api.post('/medical/admin/reorder/purchase-request', body);
export const getMedCosts = (params) => api.get('/medical/admin/costs', { params });
export const getDisposals = (params) => api.get('/medical/admin/disposals', { params });
export const recordDisposal = (id, body) => api.post(`/medical/admin/disposals/${id}/dispose`, body);
export const getFridge = (params) => api.get('/medical/admin/fridge', { params });
export const logFridge = (body) => api.post('/medical/admin/fridge', body);
// Safeguarding (any member of staff raises; the leads read the log).
export const getSafeguardingMe = () => api.get('/medical/safeguarding/me');
export const raiseConcern = (body) => api.post('/medical/safeguarding/concerns', body);
export const getMyConcerns = () => api.get('/medical/safeguarding/mine');
export const getSafeguardingLog = (params) => api.get('/medical/safeguarding/log', { params });
export const getConcern = (id) => api.get(`/medical/safeguarding/concerns/${id}`);
export const addConcernNote = (id, text) => api.post(`/medical/safeguarding/concerns/${id}/note`, { text });
export const setConcernStatus = (id, body) => api.post(`/medical/safeguarding/concerns/${id}/status`, body);
// Confirming it is you; who opened which records; leaving, keeping and the family's requests.
export const sendStepUpCode = (force) => api.post('/medical/admin/step-up/send', { force: !!force });
export const verifyStepUpCode = (code) => api.post('/medical/admin/step-up/verify', { code });
export const getAccessReview = (params) => api.get('/medical/admin/access-review', { params });
export const getRetention = () => api.get('/medical/admin/retention');
export const setLegalHold = (id, body) => api.post(`/medical/admin/students/${id}/legal-hold`, body);
export const purgeMedRecord = (id, body) => api.post(`/medical/admin/students/${id}/purge`, body);
export const getDataRequests = (params) => api.get('/medical/admin/data-requests', { params });
export const respondDataRequest = (id, body) => api.post(`/medical/admin/data-requests/${id}/respond`, body);
export const healthSummaryUrl = (id) => `/medical/admin/students/${id}/summary.pdf`;
// Staff as patients.
export const getStaffVisits = (params) => api.get('/medical/admin/staff-health', { params });
export const searchStaffPatients = (q) => api.get('/medical/admin/staff-health/search', { params: { q } });
export const getStaffHealth = (id) => api.get(`/medical/admin/staff-health/${id}`);
export const saveStaffHealth = (id, body) => api.put(`/medical/admin/staff-health/${id}`, body);
export const addStaffVisit = (body) => api.post('/medical/admin/staff-visits', body);
export const updateStaffVisit = (id, body) => api.put(`/medical/admin/staff-visits/${id}`, body);
export const archiveStaffVisit = (id, reason) => api.post(`/medical/admin/staff-visits/${id}/archive`, { reason });
export const getMyHealth = () => api.get('/medical/me/health');
export const saveMyHealth = (body) => api.put('/medical/me/health', body);
// Urgent news to families: who has been reached.
export const getUrgentNotices = () => api.get('/medical/admin/urgent');
export const logUrgentAttempt = (id, body) => api.post(`/medical/admin/urgent/${id}/attempt`, body);
export const closeUrgentNotice = (id, body) => api.post(`/medical/admin/urgent/${id}/close`, body || {});
export const reopenVisit = (id, reason) => api.post(`/medical/admin/visits/${id}/reopen`, { reason });
export const contactParentAbout = (id, body) => api.post(`/medical/admin/visits/${id}/contact-parent`, body);
export const moveVisitBed = (id, bed) => api.post(`/medical/admin/visits/${id}/bed`, { bed });

export const createIncident = (body) => api.post('/medical/admin/incidents', body);
export const getIncident = (id) => api.get(`/medical/admin/incidents/${id}`);
export const updateIncident = (id, body) => api.put(`/medical/admin/incidents/${id}`, body);
export const setIncidentStatus = (id, body) => api.post(`/medical/admin/incidents/${id}/status`, body);
export const notifyIncidentParents = (id, body) => api.post(`/medical/admin/incidents/${id}/notify-parents`, body || {});
export const treatIncident = (id, body) => api.post(`/medical/admin/incidents/${id}/treat`, body || {});

export const recordFirstAid = (body) => api.post('/medical/admin/first-aid', body);
export const getFirstAid = (id) => api.get(`/medical/admin/first-aid/${id}`);
/** kind: visit | incident | checkup; body: { status: done | cancelled, outcome } */
export const completeFollowUp = (kind, id, body) => api.post(`/medical/admin/follow-ups/${kind}/${id}`, body);
/** kind: visits | incidents | first-aid */
export const archiveMedCase = (kind, id, reason) => api.post(`/medical/admin/cases/${kind}/${id}/archive`, { reason });
export const restoreMedCase = (kind, id) => api.post(`/medical/admin/cases/${kind}/${id}/restore`, {});

export const createBed = (body) => api.post('/medical/admin/beds', body);
export const updateBed = (id, body) => api.put(`/medical/admin/beds/${id}`, body);
export const removeBed = (id) => api.delete(`/medical/admin/beds/${id}`);

export const createMedItem = (body) => api.post('/medical/admin/items', body);
export const getMedItem = (id) => api.get(`/medical/admin/items/${id}`);
export const updateMedItem = (id, body) => api.put(`/medical/admin/items/${id}`, body);
export const archiveMedItem = (id, force) => api.post(`/medical/admin/items/${id}/archive`, { force });
export const restoreMedItem = (id) => api.post(`/medical/admin/items/${id}/restore`, {});
export const stockIn = (id, body) => api.post(`/medical/admin/items/${id}/stock-in`, body);
export const stockOut = (id, body) => api.post(`/medical/admin/items/${id}/stock-out`, body);
export const adjustBatch = (id, body) => api.post(`/medical/admin/batches/${id}/adjust`, body);
export const writeOffBatch = (id, body) => api.post(`/medical/admin/batches/${id}/write-off`, body);

export const getAdministration = (day) => api.get('/medical/admin/administration', { params: { day } });
export const createPlan = (body) => api.post('/medical/admin/plans', body);
export const getPlan = (id) => api.get(`/medical/admin/plans/${id}`);
export const updatePlan = (id, body) => api.put(`/medical/admin/plans/${id}`, body);
export const authorizePlan = (id, by) => api.post(`/medical/admin/plans/${id}/authorize`, { by });
export const setPlanStatus = (id, status, note) => api.post(`/medical/admin/plans/${id}/status`, { status, note });
export const giveDose = (body) => api.post('/medical/admin/doses/give', body);
// Before a medicine is given: what the safety check says, and what was given lately.
export const checkDoseSafety = (body) => api.post('/medical/admin/safety/check', body);
export const getRecentDoses = (studentId, hours) => api.get(`/medical/admin/students/${studentId}/recent-doses`, { params: { hours } });
// Rescue medicines and emergency care plans.
export const addRescueMed = (studentId, body) => api.post(`/medical/admin/students/${studentId}/rescue-meds`, body);
export const updateRescueMed = (id, body) => api.put(`/medical/admin/rescue-meds/${id}`, body);
export const checkRescueMed = (id, body = {}) => api.post(`/medical/admin/rescue-meds/${id}/check`, body);
export const getCarePlanTemplates = () => api.get('/medical/admin/care-plans/templates');
export const addCarePlan = (studentId, body) => api.post(`/medical/admin/students/${studentId}/care-plans`, body);
export const updateCarePlan = (id, body) => api.put(`/medical/admin/care-plans/${id}`, body);
export const recordDose = (id, body) => api.post(`/medical/admin/doses/${id}/record`, body);
export const cancelDose = (id, reason) => api.post(`/medical/admin/doses/${id}/cancel`, { reason });

export const createEquipment = (body) => api.post('/medical/admin/equipment', body);
export const getEquipment = (id) => api.get(`/medical/admin/equipment/${id}`);
export const updateEquipment = (id, body) => api.put(`/medical/admin/equipment/${id}`, body);
export const maintainEquipment = (id, body) => api.post(`/medical/admin/equipment/${id}/maintenance`, body);
export const archiveEquipment = (id, reason) => api.post(`/medical/admin/equipment/${id}/archive`, { reason });

export const getMedChange = (id) => api.get(`/medical/admin/changes/${id}`);
export const reviewMedChange = (id, body) => api.post(`/medical/admin/changes/${id}/review`, body);

export const getMedReports = () => api.get('/medical/admin/reports');
export const getMedReport = (kind, params) => api.get(`/medical/admin/reports/${kind}`, { params, timeout: 120000 });
export const getMedSettings = () => api.get('/medical/admin/settings');
export const saveMedSettings = (body) => api.put('/medical/admin/settings', body);

/** A ten-minute link to preview or download a file (staff). */
// `download` asks for a link that saves the file — it is logged as a download, not a view.
export const medDocLink = (id, opts = {}) => api.get(`/medical/admin/documents/${id}/link`, { params: { download: opts.download ? 1 : undefined } });

// ── Teacher ──────────────────────────────────────────────────────────────────
export const getTeacherMedMeta = () => api.get('/medical/teacher/meta');
export const getTeacherMedOverview = () => api.get('/medical/teacher/overview');
export const findTeacherStudents = (q, mine) => api.get('/medical/teacher/students', { params: { q, mine: mine ? 1 : undefined } });
export const getTeacherRequests = (params) => api.get('/medical/teacher/requests', { params });
export const sendToMedicalRoom = (body) => api.post('/medical/teacher/requests', body);
export const withdrawMedRequest = (id, reason) => api.post(`/medical/teacher/requests/${id}/cancel`, { reason });
export const getTeacherAlerts = () => api.get('/medical/teacher/alerts');
export const getTeacherEmergency = (id) => api.get(`/medical/teacher/students/${id}/emergency`);
// In an emergency, any student's card — with a reason; logged, and the Medical Room is told.
export const teacherEmergencyAccess = (body) => api.post('/medical/teacher/emergency-access', body);
export const getTeacherIncidents = () => api.get('/medical/teacher/incidents');
export const reportIncident = (body) => api.post('/medical/teacher/incidents', body);

// ── Student & parent ─────────────────────────────────────────────────────────
export const getMyMedical = () => api.get('/medical/student/record');
export const getMyMedHistory = (params) => api.get('/medical/student/history', { params });
export const getMedChildren = () => api.get('/medical/parent/children');
export const getChildMedical = (child) => api.get('/medical/parent/record', { params: { child } });
export const getChildMedHistory = (child, params) => api.get('/medical/parent/history', { params: { child, ...params } });
export const getChildEmergency = (child) => api.get('/medical/parent/emergency', { params: { child } });
export const sendMedUpdate = (fields, file) => api.post('/medical/parent/updates', form(file, fields), multipart);
export const withdrawMedUpdate = (id) => api.post(`/medical/parent/updates/${id}/withdraw`, {});
export const authorizeMedPlan = (id) => api.post(`/medical/parent/plans/${id}/authorize`, { confirm: true });
export const confirmMedCarePlan = (id) => api.post(`/medical/parent/care-plans/${id}/confirm`, {});
export const answerUrgentNotice = (id, body) => api.post(`/medical/parent/urgent/${id}/ack`, body);
export const uploadChildCertificate = (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/medical/parent/exclusions/${id}/certificate`, fd); };
export const giveFamilyConsent = (body) => api.post('/medical/parent/consent', body);
export const sendDataRequest = (body) => api.post('/medical/parent/data-requests', body);
export const getFamilyDataRequests = (child) => api.get('/medical/parent/data-requests', { params: { child } });
export const familySummaryUrl = (child) => `/medical/parent/summary.pdf?child=${child}`;
/** A PDF from the API, downloaded with the signed-in session (a plain link would not carry it). */
export async function downloadPdf(url, filename) {
  const blob = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = href; a.download = filename || 'document.pdf'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
export const withdrawFamilyConsent = (id, reason) => api.post(`/medical/parent/consent/${id}/withdraw`, { reason });

/** Anyone with access to the module: a link to a file they may read. */
export const fileLink = (id, opts = {}) => api.get(`/medical/files/${id}`, { params: { link: 1, download: opts.download ? 1 : undefined } });

/* ── Health programmes (Oct 2026): growth, the vaccination schedule, referrals, campaigns, outbreaks ── */

export const getGrowth = (id) => api.get(`/medical/admin/students/${id}/growth`);
export const assessGrowth = (body) => api.post('/medical/admin/growth/assess', body);
export const getStudentSchedule = (id) => api.get(`/medical/admin/students/${id}/schedule`);
export const addVaccineExemption = (id, body) => api.post(`/medical/admin/students/${id}/exemptions`, body);
export const endVaccineExemption = (id, reason) => api.post(`/medical/admin/exemptions/${id}/end`, { reason });
export const getVaccineCoverage = (params) => api.get('/medical/admin/vaccine-coverage', { params });
export const askVaccineFamilies = (body) => api.post('/medical/admin/vaccine-coverage/ask', body);

export const getReferrals = (params) => api.get('/medical/admin/referrals', { params });
export const getReferral = (id) => api.get(`/medical/admin/referrals/${id}`);
export const createReferral = (body) => api.post('/medical/admin/referrals', body);
export const referralAct = (id, body) => api.post(`/medical/admin/referrals/${id}/act`, body);
export const referralLetterUrl = (id) => `/medical/admin/referrals/${id}/letter.pdf`;
export const familyReferralLetterUrl = (id) => `/medical/parent/referrals/${id}/letter.pdf`;
/** The family answers a referral; a report file (optional) goes with "seen". */
export const answerReferral = (id, body, file) => {
  if (!file) return api.post(`/medical/parent/referrals/${id}/answer`, body);
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) fd.append(k, String(v));
  fd.append('file', file);
  return api.post(`/medical/parent/referrals/${id}/answer`, fd, multipart);
};

export const getCampaigns = (params) => api.get('/medical/admin/campaigns', { params });
export const getCampaign = (id, params) => api.get(`/medical/admin/campaigns/${id}`, { params });
export const createCampaign = (body) => api.post('/medical/admin/campaigns', body);
export const updateCampaign = (id, body) => api.put(`/medical/admin/campaigns/${id}`, body);
export const campaignAction = (id, action, body = {}) => api.post(`/medical/admin/campaigns/${id}/${action}`, body);
export const recordCampaign = (id, body) => api.post(`/medical/admin/campaigns/${id}/record`, body);
export const markCampaignRest = (id, body) => api.post(`/medical/admin/campaigns/${id}/mark-rest`, body);
export const answerCampaign = (body) => api.post('/medical/parent/campaigns/answer', body);

export const getOutbreaks = (params) => api.get('/medical/admin/outbreaks', { params });
export const getOutbreak = (id) => api.get(`/medical/admin/outbreaks/${id}`);
export const outbreakAct = (id, body) => api.post(`/medical/admin/outbreaks/${id}/act`, body);
export const outbreakNoticeDraft = (id, audience) => api.get(`/medical/admin/outbreaks/${id}/notice-draft`, { params: { audience } });
export const sendOutbreakNotice = (id, body) => api.post(`/medical/admin/outbreaks/${id}/notice`, body);
export const getIllnessReports = (params) => api.get('/medical/admin/illness-reports', { params });
export const markIllnessSeen = (id) => api.post(`/medical/admin/illness-reports/${id}/seen`, {});
export const reportIllness = (body) => api.post('/medical/parent/illness', body);
export const withdrawIllness = (id) => api.post(`/medical/parent/illness/${id}/withdraw`, {});

/* ── Finding a student by ID card; the walk-in kiosk ── */
export const resolveMedStudent = (q) => api.get('/medical/admin/resolve', { params: { q } });
export const getKioskMeta = () => api.get('/medical/admin/kiosk/meta');
export const kioskWalkIn = (body) => api.post('/medical/admin/kiosk/walk-in', body);

/* ── Printed documents ── */
export const incidentReportUrl = (id) => `/medical/admin/incidents/${id}/report.pdf`;
export const handoverUrl = (id) => `/medical/admin/visits/${id}/handover.pdf`;
export const annualCardUrl = (id, year) => `/medical/admin/students/${id}/annual.pdf${year ? `?year=${year}` : ''}`;
export const annualSetUrl = (sectionId, year) => `/medical/admin/annual-cards.pdf?sectionId=${sectionId}${year ? `&year=${year}` : ''}`;
export const familyAnnualUrl = (child, year) => `/medical/family/annual.pdf?child=${child}${year ? `&year=${year}` : ''}`;
/** A PDF made from a POSTed request (an emergency card set from a chosen list). */
export async function downloadPdfPost(url, body, filename) {
  const blob = await api.post(url, body, { responseType: 'blob' });
  const href = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = href; a.download = filename || 'document.pdf'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

/* ── Import from a spreadsheet; the start of a new year ── */
export const importTemplateUrl = (kind) => `/medical/admin/import/template/${kind}`;
export const previewImport = (body) => api.post('/medical/admin/import/preview', body, { timeout: 120000 });
export const commitImport = (body) => api.post('/medical/admin/import/commit', body, { timeout: 300000 });
export const getRollover = () => api.get('/medical/admin/rollover');
export const rolloverAct = (key) => api.post(`/medical/admin/rollover/${key}`, {});
/** Any file from the API, downloaded with the session. */
export async function downloadFile(url, filename, type = 'application/octet-stream') {
  const blob = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type }));
  const a = document.createElement('a');
  a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
/** The language the Medical Room writes to this parent in: '' (the school's choice), 'en' or 'hi'. */
export const setFamilyLanguage = (language) => api.post('/medical/parent/language', { language });
