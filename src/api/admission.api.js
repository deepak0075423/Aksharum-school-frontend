import api from './axios';

/**
 * The admission module's API (school-backend/routes/api/admission.js).
 *
 *   pub.*     the public portal — no sign-in
 *   portal.*  the signed-in applicant (role guest)
 *   admin.*   admission administrators (and an exam's evaluators for marking)
 *   staff.*   teachers' admission duties
 */
const P = (slug) => `/admission/public/portals/${encodeURIComponent(slug)}`;

export const pub = {
  portal:   (slug) => api.get(P(slug)),
  register: (slug, data) => api.post(`${P(slug)}/register`, data),
  resend:   (slug, data) => api.post(`${P(slug)}/register/resend`, data),
  verify:   (slug, data) => api.post(`${P(slug)}/register/verify`, data),
  login:    (slug, data) => api.post(`${P(slug)}/login`, data),
  forgot:   (slug, data) => api.post(`${P(slug)}/forgot-password`, data),
  reset:    (slug, data) => api.post(`${P(slug)}/reset-password`, data),
  enquiry:  (slug, data) => api.post(`${P(slug)}/enquiries`, data),
  lottery:  (slug, listId) => api.get(`${P(slug)}/lotteries/${listId}`),
  pincode:        (pin) => api.get(`/admission/public/pincodes/${pin}`, { meta: { quiet: true } }),
  visits:         (slug) => api.get(`${P(slug)}/visits`),
  group:          (slug) => api.get(`/admission/public/groups/${encodeURIComponent(slug)}`),
  payLink:        (slug, token) => api.get(`${P(slug)}/pay/${token}`),
  payLinkOrder:   (slug, token, part) => api.post(`${P(slug)}/pay/${token}/order`, { part }),
  payLinkVerify:  (slug, token, data) => api.post(`${P(slug)}/pay/${token}/verify`, data),
  payLinkReceiptUrl: (slug, token, paymentId) => `${P(slug)}/pay/${token}/receipt/${paymentId}`,
};

const A = (id) => `/admission/portal/applications/${id}`;

export const portal = {
  me:          () => api.get('/admission/portal/me'),
  rounds:      () => api.get('/admission/portal/rounds'),
  updates:     () => api.get('/admission/portal/updates'),
  list:        () => api.get('/admission/portal/applications'),
  create:      (data) => api.post('/admission/portal/applications', data),
  detail:      (id) => api.get(A(id)),
  save:        (id, data) => api.put(A(id), { data }, { meta: { quiet: true } }),
  submit:      (id, data) => api.post(`${A(id)}/submit`, { data }),
  withdraw:    (id, reason) => api.post(`${A(id)}/withdraw`, { reason }),
  discard:     (id) => api.delete(A(id)),
  upload:      (id, docType, file, onUploadProgress) => {
    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('file', file);
    return api.post(`${A(id)}/documents`, fd, { timeout: 120000, onUploadProgress });
  },
  removeDoc:   (id, docId) => api.delete(`${A(id)}/documents/${docId}`),
  docUrl:      (id, docId) => `${A(id)}/documents/${docId}/file`,
  payOrder:    (id, kind, part) => api.post(`${A(id)}/pay`, { kind, part }),
  payVerify:   (id, data) => api.post(`${A(id)}/pay/verify`, data),
  reconcile:   (id, paymentId) => api.post(`${A(id)}/payments/${paymentId}/reconcile`),
  receiptUrl:  (id, paymentId) => `${A(id)}/payments/${paymentId}/receipt`,
  respond:     (id, accept, note, withdrawOthers = false) => api.post(`${A(id)}/offer/respond`, { accept, note, withdrawOthers }),
  lists:       (id) => api.get(`${A(id)}/lists`),
  ackUrl:      (id) => `${A(id)}/acknowledgement.pdf`,
  admitUrl:    (id, examId) => `${A(id)}/exams/${examId}/admit-card.pdf`,
  scoreUrl:    (id, examId) => `${A(id)}/exams/${examId}/scorecard.pdf`,
  offerUrl:    (id) => `${A(id)}/offer-letter.pdf`,
  startExam:   (id, examId) => api.post(`${A(id)}/exams/${examId}/start`),
  attempt:     (id, attemptId) => api.get(`${A(id)}/attempts/${attemptId}`),
  saveAnswers: (id, attemptId, data) => api.put(`${A(id)}/attempts/${attemptId}/answers`, data, { meta: { quiet: true }, timeout: 15000 }),
  submitExam:  (id, attemptId, data) => api.post(`${A(id)}/attempts/${attemptId}/submit`, data),
  violation:   (id, attemptId, type) => api.post(`${A(id)}/attempts/${attemptId}/violation`, { type }, { meta: { quiet: true } }),
  nextSection: (id, attemptId) => api.post(`${A(id)}/attempts/${attemptId}/next-section`),
  privacy:     () => api.get('/admission/portal/privacy'),
  privacyExportUrl: () => '/admission/portal/privacy/export',
  privacyRequest: (data) => api.post('/admission/portal/privacy/requests', data),
  consent:     (version) => api.post('/admission/portal/consent', { version }),
  examSlots:   (id, examId) => api.get(`${A(id)}/exams/${examId}/slots`),
  chooseSlot:  (id, examId, slotId) => api.post(`${A(id)}/exams/${examId}/slot`, { slotId }),
  examCalUrl:  (id, examId) => `${A(id)}/exams/${examId}/calendar.ics`,
  visits:      () => api.get('/admission/portal/visits'),
  bookVisit:   (slotId, data) => api.post(`/admission/portal/visits/${slotId}/book`, data),
  cancelVisit: (bookingId) => api.post(`/admission/portal/visit-bookings/${bookingId}/cancel`),
  visitCalUrl: (bookingId) => `/admission/portal/visit-bookings/${bookingId}/calendar.ics`,
  digilocker:  (id) => api.get(`${A(id)}/digilocker`, { meta: { quiet: true } }),
  digilockerStart: (id) => api.post(`${A(id)}/digilocker/start`),
  digilockerImport: (id, data) => api.post(`${A(id)}/digilocker/import`, data, { timeout: 60000 }),
  group:       () => api.get('/admission/portal/group'),
  groupOrder:  (order) => api.put('/admission/portal/group/preferences', { order }),
  appeals:     (id) => api.get(`${A(id)}/appeals`),
  fileAppeal:  (id, data) => api.post(`${A(id)}/appeals`, data),
  withdrawAppeal: (id, appealId) => api.post(`${A(id)}/appeals/${appealId}/withdraw`),
};

const AD = '/admission/admin';
const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const t = s.toString();
  return t ? `?${t}` : '';
};

export const admin = {
  bootstrap:     () => api.get(`${AD}/bootstrap`),
  staff:         () => api.get(`${AD}/staff`),
  saveSettings:  (blocks) => api.put(`${AD}/settings`, blocks),
  slugCheck:     (slug) => api.get(`${AD}/settings/slug-check${qs({ slug })}`, { meta: { quiet: true } }),
  saveSlug:      (slug) => api.put(`${AD}/settings/slug`, { slug }),
  numberPreview: (template) => api.get(`${AD}/settings/number-preview${qs({ template })}`, { meta: { quiet: true } }),
  workflow:      () => api.get(`${AD}/workflow`),
  saveWorkflow:  (stages) => api.put(`${AD}/workflow`, { stages }),

  rounds:        () => api.get(`${AD}/rounds`),
  createRound:   (data) => api.post(`${AD}/rounds`, data),
  updateRound:   (id, data) => api.put(`${AD}/rounds/${id}`, data),
  roundStatus:   (id, status) => api.post(`${AD}/rounds/${id}/status`, { status }),
  deleteRound:   (id) => api.delete(`${AD}/rounds/${id}`),
  roundSeats:    (id) => api.get(`${AD}/rounds/${id}/seats`),

  forms:         () => api.get(`${AD}/forms`),
  createForm:    (data) => api.post(`${AD}/forms`, data),
  form:          (id) => api.get(`${AD}/forms/${id}`),
  updateForm:    (id, data) => api.put(`${AD}/forms/${id}`, data),
  deleteForm:    (id) => api.delete(`${AD}/forms/${id}`),
  saveDraft:     (id, schema) => api.put(`${AD}/forms/${id}/draft`, { schema }),
  publishForm:   (id, changeNote) => api.post(`${AD}/forms/${id}/publish`, { changeNote }),
  discardDraft:  (id) => api.post(`${AD}/forms/${id}/discard-draft`),
  duplicateForm: (id, name) => api.post(`${AD}/forms/${id}/duplicate`, { name }),
  testForm:      (id, data) => api.post(`${AD}/forms/${id}/test`, data),
  version:       (id, versionId) => api.get(`${AD}/forms/${id}/versions/${versionId}`),

  docTypes:      () => api.get(`${AD}/document-types`),
  createDocType: (data) => api.post(`${AD}/document-types`, data),
  updateDocType: (id, data) => api.put(`${AD}/document-types/${id}`, data),
  deleteDocType: (id) => api.delete(`${AD}/document-types/${id}`),
  orderDocTypes: (ids) => api.put(`${AD}/document-types/order`, { ids }),

  emails:        () => api.get(`${AD}/emails`),
  saveEmail:     (event, data) => api.put(`${AD}/emails/${event}`, data),
  previewEmail:  (event, data) => api.post(`${AD}/emails/${event}/preview`, data, { meta: { quiet: true } }),
  testEmail:     (event, data) => api.post(`${AD}/emails/${event}/test`, data),
  toggleEmail:   (event, enabled) => api.put(`${AD}/emails/${event}/enabled`, { enabled }),
  emailVersions: (event) => api.get(`${AD}/emails/${event}/versions`),
  restoreEmail:  (event, version) => api.post(`${AD}/emails/${event}/restore`, { version }),
  resetEmail:    (event) => api.post(`${AD}/emails/${event}/reset`),
  emailLogs:     (params) => api.get(`${AD}/email-logs${qs(params)}`),
  retryEmail:    (id) => api.post(`${AD}/email-logs/${id}/retry`),
  suppressions:  () => api.get(`${AD}/email-suppressions`),
  addSuppression:(email, reason) => api.post(`${AD}/email-suppressions`, { email, reason }),
  removeSuppression: (id) => api.delete(`${AD}/email-suppressions/${id}`),
  domainCheck:   (selector) => api.get(`${AD}/email-domain-check${qs({ selector })}`),

  enquiries:     (params) => api.get(`${AD}/enquiries${qs(params)}`),
  updateEnquiry: (id, data) => api.patch(`${AD}/enquiries/${id}`, data),
  createEnquiry: (data) => api.post(`${AD}/enquiries`, data),
  enquiryContact: (id, data) => api.post(`${AD}/enquiries/${id}/interactions`, data),
  sources:       (params) => api.get(`${AD}/sources${qs(params)}`),
  setSpend:      (data) => api.put(`${AD}/sources`, data),
  applicants:    (params) => api.get(`${AD}/applicants${qs(params)}`),
  setApplicant:  (userId, isActive) => api.patch(`${AD}/applicants/${userId}`, { isActive }),
  analytics:     (params) => api.get(`${AD}/analytics${qs(params)}`),
  audit:         (params) => api.get(`${AD}/audit${qs(params)}`),

  applications:  (params) => api.get(`${AD}/applications${qs(params)}`),
  exportUrl:     (params) => `${AD}/applications/export${qs(params)}`,
  bulk:          (data) => api.post(`${AD}/applications/bulk`, data),
  application:   (id) => api.get(`${AD}/applications/${id}`),
  applicationPdfUrl: (id) => `${AD}/applications/${id}/application.pdf`,
  transition:    (id, data) => api.post(`${AD}/applications/${id}/transition`, data),
  approval:      (id, approve, note) => api.post(`${AD}/applications/${id}/approval`, { approve, note }),
  assign:        (id, userId) => api.patch(`${AD}/applications/${id}/assign`, { userId }),
  note:          (id, text) => api.post(`${AD}/applications/${id}/notes`, { text }),
  correct:       (id, data, reason) => api.put(`${AD}/applications/${id}/answers`, { data, reason }),
  clearDuplicate:(id) => api.post(`${AD}/applications/${id}/duplicates/clear`),
  uploadDoc:     (id, docType, file) => {
    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('file', file);
    return api.post(`${AD}/applications/${id}/documents`, fd, { timeout: 120000 });
  },
  recordPayment: (id, data) => api.post(`${AD}/applications/${id}/payments`, data),
  voidPayment:   (id, paymentId, reason) => api.post(`${AD}/applications/${id}/payments/${paymentId}/void`, { reason }),
  refund:        (id, paymentId, data) => api.post(`${AD}/applications/${id}/payments/${paymentId}/refund`, data),
  examSlots:     (examId) => api.get(`${AD}/exams/${examId}/slots`),
  health:        () => api.get(`${AD}/health`, { meta: { quiet: true } }),
  enrolPlan:     (params) => api.get(`${AD}/enrolment/plan${qs(params)}`),
  enrolBulk:     (rows) => api.post(`${AD}/enrolment/bulk`, { rows }, { timeout: 300000 }),
  forecast:      (round) => api.get(`${AD}/forecast${qs({ round })}`),
  myGroup:       () => api.get(`${AD}/group`),
  groupListing:  (listed) => api.put(`${AD}/group/listing`, { listed }),
  transfers:     () => api.get(`${AD}/transfers`),
  offerTransfer: (id, data) => api.post(`${AD}/applications/${id}/transfer`, data),
  decideTransfer: (id, data) => api.post(`${AD}/transfers/${id}/decide`, data),
  cancelTransfer: (id) => api.post(`${AD}/transfers/${id}/cancel`),
  siblings:      (id) => api.get(`${AD}/applications/${id}/siblings`, { meta: { quiet: true } }),
  exportJobs:    () => api.get(`${AD}/exports`),
  queueExport:   (data) => api.post(`${AD}/exports`, data),
  exportFileUrl: (id) => `${AD}/exports/${id}/file`,
  appeals:       (params) => api.get(`${AD}/appeals${qs(params)}`),
  appeal:        (id) => api.get(`${AD}/appeals/${id}`),
  assignAppeal:  (id, userId) => api.patch(`${AD}/appeals/${id}/assign`, { userId }),
  decideAppeal:  (id, data) => api.post(`${AD}/appeals/${id}/decide`, data),
  visits:        (params) => api.get(`${AD}/visits${qs(params)}`),
  openVisits:    (data) => api.post(`${AD}/visits`, data),
  updateVisit:   (id, data) => api.patch(`${AD}/visits/${id}`, data),
  cancelVisit:   (id, reason) => api.post(`${AD}/visits/${id}/cancel`, { reason }),
  visitBookings: (id) => api.get(`${AD}/visits/${id}/bookings`),
  markVisit:     (bookingId, status) => api.patch(`${AD}/visit-bookings/${bookingId}`, { status }),
  payLink:       (id, data) => api.post(`${AD}/applications/${id}/pay-link`, data),
  receiptUrl:    (id, paymentId) => `${AD}/applications/${id}/payments/${paymentId}/receipt`,
  addWaiver:     (id, data) => api.post(`${AD}/applications/${id}/waivers`, data),
  removeWaiver:  (id, data) => api.post(`${AD}/applications/${id}/waivers/remove`, data),
  offer:         (id, data) => api.post(`${AD}/applications/${id}/offer`, data),
  withdrawOffer: (id, reason) => api.post(`${AD}/applications/${id}/offer/withdraw`, { reason }),
  extendOffer:   (id, date) => api.post(`${AD}/applications/${id}/offer/extend`, { date }),
  respondOffer:  (id, accept, note) => api.post(`${AD}/applications/${id}/offer/respond`, { accept, note }),
  confirmation:  (id) => api.get(`${AD}/applications/${id}/confirmation`),
  confirm:       (id) => api.post(`${AD}/applications/${id}/confirm`),
  conversion:    (id) => api.get(`${AD}/applications/${id}/conversion`),
  convert:       (id, data) => api.post(`${AD}/applications/${id}/convert`, data, { timeout: 120000 }),
  activate:      (id) => api.post(`${AD}/applications/${id}/activate`),

  documents:     (params) => api.get(`${AD}/documents${qs(params)}`),
  reviewDoc:     (docId, data) => api.post(`${AD}/documents/${docId}/review`, data),
  docUrl:        (docId) => `${AD}/documents/${docId}/file`,
  payments:      (params) => api.get(`${AD}/payments${qs(params)}`),

  exams:         (params) => api.get(`${AD}/exams${qs(params)}`),
  createExam:    (data) => api.post(`${AD}/exams`, data),
  exam:          (id) => api.get(`${AD}/exams/${id}`),
  updateExam:    (id, data) => api.put(`${AD}/exams/${id}`, data),
  deleteExam:    (id) => api.delete(`${AD}/exams/${id}`),
  scheduleExam:  (id) => api.post(`${AD}/exams/${id}/schedule`),
  cancelExam:    (id, reason) => api.post(`${AD}/exams/${id}/cancel`, { reason }),
  addQuestion:   (id, data) => api.post(`${AD}/exams/${id}/questions`, data),
  updateQuestion:(qid, data) => api.put(`${AD}/questions/${qid}`, data),
  deleteQuestion:(qid) => api.delete(`${AD}/questions/${qid}`),
  orderQuestions:(id, ids) => api.put(`${AD}/exams/${id}/questions/order`, { ids }),
  importQuestions:(id, ids) => api.post(`${AD}/exams/${id}/questions/import`, { ids }),
  bank:          (params) => api.get(`${AD}/question-bank${qs(params)}`),
  addToBank:     (data) => api.post(`${AD}/question-bank`, data),
  eligible:      (id) => api.get(`${AD}/exams/${id}/eligible`),
  assign:        (id, applicationIds) => api.post(`${AD}/exams/${id}/candidates`, { applicationIds }),
  updateCandidate:(id, cid, data) => api.patch(`${AD}/exams/${id}/candidates/${cid}`, data),
  removeCandidate:(id, cid) => api.delete(`${AD}/exams/${id}/candidates/${cid}`),
  attendance:    (id, cid, present) => api.post(`${AD}/exams/${id}/candidates/${cid}/attendance`, { present }),
  admitUrl:      (id, cid) => `${AD}/exams/${id}/candidates/${cid}/admit-card.pdf`,
  results:       (id) => api.get(`${AD}/exams/${id}/results`),
  marks:         (id, rows) => api.put(`${AD}/exams/${id}/marks`, { rows }),
  attemptReview: (attemptId) => api.get(`${AD}/attempts/${attemptId}`),
  evaluate:      (attemptId, marks) => api.put(`${AD}/attempts/${attemptId}/evaluate`, { marks }),
  submitResults: (id) => api.post(`${AD}/exams/${id}/results/submit`),
  approveResults:(id) => api.post(`${AD}/exams/${id}/results/approve`),
  publishResults:(id, at) => api.post(`${AD}/exams/${id}/results/publish`, { at }),
  correctResult: (resultId, data) => api.post(`${AD}/results/${resultId}/correct`, data),
  resultsExportUrl: (id, format) => `${AD}/exams/${id}/results/export${qs({ format })}`,

  lists:         (params) => api.get(`${AD}/lists${qs(params)}`),
  createList:    (data) => api.post(`${AD}/lists`, data),
  list:          (id) => api.get(`${AD}/lists/${id}`),
  updateList:    (id, data) => api.put(`${AD}/lists/${id}`, data),
  deleteList:    (id) => api.delete(`${AD}/lists/${id}`),
  rebuildList:   (id) => api.post(`${AD}/lists/${id}/rebuild`),
  decision:      (id, entryId, data) => api.patch(`${AD}/lists/${id}/entries/${entryId}`, data),
  submitList:    (id) => api.post(`${AD}/lists/${id}/submit`),
  approveList:   (id) => api.post(`${AD}/lists/${id}/approve`),
  returnList:    (id, note) => api.post(`${AD}/lists/${id}/return`, { note }),
  publishList:   (id, at) => api.post(`${AD}/lists/${id}/publish`, { at }),
  closeList:     (id) => api.post(`${AD}/lists/${id}/close`),
  drawList:      (id, data) => api.post(`${AD}/lists/${id}/draw`, data),
  privacyRequests: (status) => api.get(`${AD}/privacy/requests${qs({ status })}`),
  answerRequest: (id, data) => api.patch(`${AD}/privacy/requests/${id}`, data),
  eraseRequest:  (id) => api.post(`${AD}/privacy/requests/${id}/erase`),
  retention:     () => api.get(`${AD}/privacy/retention`),
  runRetention:  () => api.post(`${AD}/privacy/retention/run`),
  accessLog:     (params) => api.get(`${AD}/privacy/access-log${qs(params)}`),
  legalHold:     (id, on, reason) => api.post(`${AD}/applications/${id}/legal-hold`, { on, reason }),
  setQuota:      (id, data) => api.patch(`${AD}/applications/${id}/quota`, data),
  roundPools:    (id, classId) => api.get(`${AD}/rounds/${id}/pools${qs({ class: classId })}`),
  releaseQuota:  (id, data) => api.post(`${AD}/rounds/${id}/quotas/release`, data),
  importRte:     (id, data) => api.post(`${AD}/rounds/${id}/rte-allotments`, data),
  rteRegister:   (year) => api.get(`${AD}/rte/register${qs({ year })}`),
  rteRegisterCsvUrl: (year) => `${AD}/rte/register${qs({ year, format: 'csv' })}`,
  updateRteClaim:(id, data) => api.patch(`${AD}/rte/register/${id}`, data),
  reveal:        (id, field) => api.post(`${AD}/applications/${id}/reveal`, { field }),
  verifyDraw:    (id) => api.get(`${AD}/lists/${id}/verify`),
  cancelList:    (id, reason) => api.post(`${AD}/lists/${id}/cancel`, { reason }),
  listExportUrl: (id, format, office) => `${AD}/lists/${id}/export${qs({ format, office })}`,
  offers:        (params) => api.get(`${AD}/offers${qs(params)}`),
};

export const staff = {
  duties:      () => api.get('/admission/staff/duties'),
  application: (id) => api.get(`/admission/staff/applications/${id}`),
  transition:  (id, data) => api.post(`/admission/staff/applications/${id}/transition`, data),
  note:        (id, text) => api.post(`/admission/staff/applications/${id}/notes`, { text }),
  documents:   () => api.get('/admission/staff/documents'),
  reviewDoc:   (docId, data) => api.post(`/admission/staff/documents/${docId}/review`, data),
  docUrl:      (docId) => `/admission/staff/documents/${docId}/file`,
};

/**
 * Open (or download) a file the API serves behind sign-in: fetched with the
 * session token, then shown from a local object URL — private files never sit
 * at a public address.
 */
export async function openProtected(url, { download = false, filename = 'file' } = {}) {
  // The tab is opened now, while the click still counts as the person's —
  // a window opened after the download would be stopped by pop-up blockers.
  const tab = download ? null : window.open('', '_blank');
  try {
    const res = await api.get(url, { responseType: 'blob', timeout: 120000 });
    const blob = res instanceof Blob ? res : new Blob([res]);
    const href = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (tab) {
      tab.location.href = href;
    } else {
      window.location.assign(href);
    }
    setTimeout(() => URL.revokeObjectURL(href), 120000);
  } catch (err) {
    if (tab) tab.close();
    // A refused file arrives as a Blob of JSON; say what the server said.
    let message = err?.message || 'The file could not be opened';
    try { const text = await err?.data?.text?.(); if (text) message = JSON.parse(text).message || message; } catch { /* keep the first message */ }
    throw new Error(message);
  }
}

/** The platform's admission groups (super admin) — services/admission/groups.js. */
export const platform = {
  groups:      () => api.get('/super-admin/admission-groups'),
  createGroup: (data) => api.post('/super-admin/admission-groups', data),
  updateGroup: (id, data) => api.put(`/super-admin/admission-groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/super-admin/admission-groups/${id}`),
  schools:     (search = '') => api.get('/super-admin/schools', { params: { limit: 200, search } }),
};
