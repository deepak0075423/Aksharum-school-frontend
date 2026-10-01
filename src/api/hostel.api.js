import api from './axios';

// ── Admin: dashboard / meta / settings / audit ────────────────────────────────
export const getDashboard = () => api.get('/hostel/admin/dashboard');
// The redesigned Dashboard's one call: ?year=&range=6m|12m|year&day=today|yesterday
export const getOverview  = (params) => api.get('/hostel/admin/overview', { params });
// Every other redesigned list screen: tiles, tab counts and one page of rows.
export const getBoard     = (screen, params) => api.get(`/hostel/admin/board/${screen}`, { params });
export const getMeta      = () => api.get('/hostel/admin/meta');
export const searchStudents = (params) => api.get('/hostel/admin/students', { params });
export const getSettings  = () => api.get('/hostel/admin/settings');
export const updateSettings = (d) => api.put('/hostel/admin/settings', d);
export const getAudit     = (params) => api.get('/hostel/admin/audit', { params });

// ── Hostels ───────────────────────────────────────────────────────────────────
export const getHostels   = (params) => api.get('/hostel/admin/hostels', { params });
export const getHostel    = (id)     => api.get(`/hostel/admin/hostels/${id}`);
export const createHostel = (d)      => api.post('/hostel/admin/hostels', d);
export const updateHostel = (id, d)  => api.put(`/hostel/admin/hostels/${id}`, d);
export const deleteHostel = (id)     => api.delete(`/hostel/admin/hostels/${id}`);

// ── Buildings & floors ────────────────────────────────────────────────────────
export const getBuildings   = (params) => api.get('/hostel/admin/buildings', { params });
export const createBuilding = (d)      => api.post('/hostel/admin/buildings', d);
export const updateBuilding = (id, d)  => api.put(`/hostel/admin/buildings/${id}`, d);
export const deleteBuilding = (id)     => api.delete(`/hostel/admin/buildings/${id}`);
export const getFloors      = (params) => api.get('/hostel/admin/floors', { params });
export const createFloor    = (d)      => api.post('/hostel/admin/floors', d);
export const updateFloor    = (id, d)  => api.put(`/hostel/admin/floors/${id}`, d);
export const deleteFloor    = (id)     => api.delete(`/hostel/admin/floors/${id}`);

// ── Rooms & beds ──────────────────────────────────────────────────────────────
export const getOccupancy = (params) => api.get('/hostel/admin/occupancy', { params });
export const getRooms     = (params) => api.get('/hostel/admin/rooms', { params });
export const getRoom      = (id)     => api.get(`/hostel/admin/rooms/${id}`);
export const createRoom   = (d)      => api.post('/hostel/admin/rooms', d);
export const updateRoom   = (id, d)  => api.put(`/hostel/admin/rooms/${id}`, d);
export const deleteRoom   = (id)     => api.delete(`/hostel/admin/rooms/${id}`);
export const generateBeds = (id, d)  => api.post(`/hostel/admin/rooms/${id}/beds`, d);
export const getBeds      = (params) => api.get('/hostel/admin/beds', { params });
export const createBed    = (d)      => api.post('/hostel/admin/beds', d);
export const updateBed    = (id, d)  => api.put(`/hostel/admin/beds/${id}`, d);
export const setBedState  = (id, d)  => api.post(`/hostel/admin/beds/${id}/state`, d);
export const deleteBed    = (id)     => api.delete(`/hostel/admin/beds/${id}`);

// ── Admissions ────────────────────────────────────────────────────────────────
export const getAdmissions   = (params) => api.get('/hostel/admin/admissions', { params });
export const getAdmission    = (id)     => api.get(`/hostel/admin/admissions/${id}`);
export const createAdmission = (d)      => api.post('/hostel/admin/admissions', d);
export const updateAdmission = (id, d)  => api.put(`/hostel/admin/admissions/${id}`, d);
export const decideAdmission = (id, d)  => api.post(`/hostel/admin/admissions/${id}/decision`, d);

// ── Allocation ────────────────────────────────────────────────────────────────
export const getAllocations   = (params) => api.get('/hostel/admin/allocations', { params });
export const createAllocation = (d)      => api.post('/hostel/admin/allocations', d);
export const autoAllocate     = (d)      => api.post('/hostel/admin/allocations/auto', d);
export const bulkAllocate     = (d)      => api.post('/hostel/admin/allocations/bulk', d);
export const transferAllocation = (id, d) => api.post(`/hostel/admin/allocations/${id}/transfer`, d);
export const releaseAllocation  = (id, d) => api.post(`/hostel/admin/allocations/${id}/release`, d);
// A held (pending) bed becomes an active allocation once the student arrives.
export const confirmAllocation  = (id, d) => api.post(`/hostel/admin/allocations/${id}/confirm`, d);
export const getAllocationHistory = (params) => api.get('/hostel/admin/allocation-history', { params });
// What a checkout has to settle: dues, the deposit held, items on issue.
export const getCheckout        = (id)    => api.get(`/hostel/admin/allocations/${id}/checkout`);
// Year end: { toYear, carry: [allocationId], vacate: [allocationId], reason }.
export const rolloverAllocations = (d)    => api.post('/hostel/admin/allocations/rollover', d);
// Room changes waiting for a decision (a warden's, or a resident's own request).
export const getTransferRequests   = (params) => api.get('/hostel/admin/transfer-requests', { params });
export const decideTransferRequest = (id, d)  => api.post(`/hostel/admin/transfer-requests/${id}/decide`, d);
export const getStudentProfile = (studentId) => api.get(`/hostel/admin/students/${studentId}/profile`);

// ── Attendance ────────────────────────────────────────────────────────────────
export const getRegister        = (params) => api.get('/hostel/admin/attendance', { params });
export const getAttendanceHistory = (params) => api.get('/hostel/admin/attendance/history', { params });
export const markAttendance     = (d)      => api.post('/hostel/admin/attendance', d);
export const correctAttendance  = (id, d)  => api.post(`/hostel/admin/attendance/${id}/correct`, d);
export const approveCorrection  = (id, d)  => api.post(`/hostel/admin/attendance/${id}/approve`, d);

// ── Leave & outpass ───────────────────────────────────────────────────────────
export const getLeaves    = (params) => api.get('/hostel/admin/leaves', { params });
export const createLeave  = (d)      => api.post('/hostel/admin/leaves', d);
export const actOnLeave   = (id, d)  => api.post(`/hostel/admin/leaves/${id}/act`, d);
export const getOutpasses  = (params) => api.get('/hostel/admin/outpasses', { params });
export const createOutpass = (d)      => api.post('/hostel/admin/outpasses', d);
export const actOnOutpass  = (id, d)  => api.post(`/hostel/admin/outpasses/${id}/act`, d);
export const gateScan      = (d)      => api.post('/hostel/admin/outpasses/gate', d);
export const verifyOutpass = (token)  => api.get(`/hostel/admin/outpasses/verify/${token}`);
export const sweepOverdue  = ()       => api.post('/hostel/admin/outpasses/sweep');
/** The pass as a PNG URL — the image itself also rides along in the JSON. */
export const outpassQrUrl  = (id)     => `${api.defaults.baseURL}/hostel/admin/outpasses/${id}/qr.png`;

// ── Visitors ──────────────────────────────────────────────────────────────────
export const getVisitors   = (params) => api.get('/hostel/admin/visitors', { params });
export const createVisitor = (d)      => api.post('/hostel/admin/visitors', d);
export const actOnVisitor  = (id, d)  => api.post(`/hostel/admin/visitors/${id}/act`, d);
export const deleteVisitor = (id)     => api.delete(`/hostel/admin/visitors/${id}`);
// A visitor's gate pass as a QR image — asked for only when the pass is opened.
export const getVisitorPass = (id)    => api.get(`/hostel/admin/visitors/${id}/pass`);

// ── Staff ─────────────────────────────────────────────────────────────────────
export const getStaff       = (params) => api.get('/hostel/admin/staff', { params });
export const assignStaff    = (d)      => api.post('/hostel/admin/staff', d);
export const updateStaff    = (id, d)  => api.put(`/hostel/admin/staff/${id}`, d);
export const endStaff       = (id)     => api.delete(`/hostel/admin/staff/${id}`);

// ── Mess ──────────────────────────────────────────────────────────────────────
export const getMesses      = (params) => api.get('/hostel/admin/mess', { params });
export const createMess     = (d)      => api.post('/hostel/admin/mess', d);
export const updateMess     = (id, d)  => api.put(`/hostel/admin/mess/${id}`, d);
export const deleteMess     = (id)     => api.delete(`/hostel/admin/mess/${id}`);
export const getMessMembers = (params) => api.get('/hostel/admin/mess-members', { params });
export const enrolMessMember = (d)     => api.post('/hostel/admin/mess-members', d);
export const updateMessMember = (id, d) => api.put(`/hostel/admin/mess-members/${id}`, d);
export const getMenus       = (params) => api.get('/hostel/admin/menus', { params });
export const saveMenu       = (d)      => api.post('/hostel/admin/menus', d);
export const generateMenus  = (d)      => api.post('/hostel/admin/menus/generate', d);
export const deleteMenu     = (id)     => api.delete(`/hostel/admin/menus/${id}`);
export const getMessAttendance  = (params) => api.get('/hostel/admin/mess-attendance', { params });
export const markMessAttendance = (d)  => api.post('/hostel/admin/mess-attendance', d);
export const getMessExpenses    = (params) => api.get('/hostel/admin/mess-expenses', { params });
export const createMessExpense  = (d)  => api.post('/hostel/admin/mess-expenses', d);
export const deleteMessExpense  = (id) => api.delete(`/hostel/admin/mess-expenses/${id}`);

// ── Fees ──────────────────────────────────────────────────────────────────────
export const getFeePlans    = (params) => api.get('/hostel/admin/fee-plans', { params });
export const createFeePlan  = (d)      => api.post('/hostel/admin/fee-plans', d);
export const updateFeePlan  = (id, d)  => api.put(`/hostel/admin/fee-plans/${id}`, d);
export const deleteFeePlan  = (id)     => api.delete(`/hostel/admin/fee-plans/${id}`);
export const getInvoices    = (params) => api.get('/hostel/admin/invoices', { params });
export const createInvoice  = (d)      => api.post('/hostel/admin/invoices', d);
export const generateInvoices = (d)    => api.post('/hostel/admin/invoices/generate', d);
export const applyLateFees  = ()       => api.post('/hostel/admin/invoices/late-fees');
export const raiseFine      = (d)      => api.post('/hostel/admin/invoices/fine', d);
export const payInvoice     = (id, d)  => api.post(`/hostel/admin/invoices/${id}/pay`, d);
export const discountInvoice = (id, d) => api.post(`/hostel/admin/invoices/${id}/discount`, d);
export const refundInvoice  = (id, d)  => api.post(`/hostel/admin/invoices/${id}/refund`, d);
export const cancelInvoice  = (id)     => api.post(`/hostel/admin/invoices/${id}/cancel`);
// Online checkouts: ?tab=open|paid|expired. "Check" asks the gateway about one, now.
export const getOnlinePayments  = (params)  => api.get('/hostel/admin/online-payments', { params });
export const checkOnlinePayment = (orderId) => api.post(`/hostel/admin/online-payments/${encodeURIComponent(orderId)}/check`);

// ── Complaints & maintenance ──────────────────────────────────────────────────
export const getComplaints   = (params) => api.get('/hostel/admin/complaints', { params });
export const getComplaint    = (id)     => api.get(`/hostel/admin/complaints/${id}`);
export const createComplaint = (d)      => api.post('/hostel/admin/complaints', d);
export const actOnComplaint  = (id, d)  => api.post(`/hostel/admin/complaints/${id}/act`, d);
export const escalateComplaints = ()    => api.post('/hostel/admin/complaints/escalate');
export const getMaintenance    = (params) => api.get('/hostel/admin/maintenance', { params });
export const createMaintenance = (d)      => api.post('/hostel/admin/maintenance', d);
export const updateMaintenance = (id, d)  => api.put(`/hostel/admin/maintenance/${id}`, d);
export const actOnMaintenance  = (id, d)  => api.post(`/hostel/admin/maintenance/${id}/act`, d);
export const deleteMaintenance = (id)     => api.delete(`/hostel/admin/maintenance/${id}`);

// ── Assets ────────────────────────────────────────────────────────────────────
export const getAssets    = (params) => api.get('/hostel/admin/assets', { params });
export const getInventoryAssets = () => api.get('/hostel/admin/assets/inventory');
export const createAsset  = (d)      => api.post('/hostel/admin/assets', d);
export const updateAsset  = (id, d)  => api.put(`/hostel/admin/assets/${id}`, d);
export const actOnAsset   = (id, d)  => api.post(`/hostel/admin/assets/${id}/act`, d);
// The asset's code as a QR label to print; scanning it on the Assets screen finds the asset.
export const getAssetQr  = (id)     => api.get(`/hostel/admin/assets/${id}/qr`);

// ── Movement / incidents / discipline ─────────────────────────────────────────
export const getMovements   = (params) => api.get('/hostel/admin/movements', { params });
export const recordMovement = (d)      => api.post('/hostel/admin/movements', d);
export const getLiveMovement = ()      => api.get('/hostel/admin/movements/live');
export const getIncidents   = (params) => api.get('/hostel/admin/incidents', { params });
export const getIncident    = (id)     => api.get(`/hostel/admin/incidents/${id}`);
export const createIncident = (d)      => api.post('/hostel/admin/incidents', d);
export const updateIncident = (id, d)  => api.put(`/hostel/admin/incidents/${id}`, d);
export const getDiscipline  = (params) => api.get('/hostel/admin/discipline', { params });
export const createDiscipline = (d)    => api.post('/hostel/admin/discipline', d);
export const updateDiscipline = (id, d) => api.put(`/hostel/admin/discipline/${id}`, d);
export const getStudentDiscipline = (studentId) => api.get(`/hostel/admin/discipline/student/${studentId}`);

// ── Communication, documents, reports ─────────────────────────────────────────
// Announcements are kept: { …, mode: 'send' | 'draft' | 'schedule', scheduledAt }.
export const createAnnouncement  = (d)      => api.post('/hostel/admin/announcements', d);
export const getAnnouncement     = (id)     => api.get(`/hostel/admin/announcements/${id}`);
export const updateAnnouncement  = (id, d)  => api.put(`/hostel/admin/announcements/${id}`, d);
export const sendAnnouncementNow = (id)     => api.post(`/hostel/admin/announcements/${id}/send`);
export const archiveAnnouncement = (id)     => api.post(`/hostel/admin/announcements/${id}/archive`);
export const restoreAnnouncement = (id)     => api.post(`/hostel/admin/announcements/${id}/restore`);
export const deleteAnnouncement  = (id)     => api.delete(`/hostel/admin/announcements/${id}`);
export const getAudienceSize     = (params) => api.get('/hostel/admin/announcements/audience', { params });
/**
 * Attach a file to a complaint, incident, maintenance request, leave or
 * outpass. Returns the stored filename, which the form then submits in that
 * record's `attachments` array.
 */
export const uploadAttachment = (formData) => api.post('/hostel/admin/attachments', formData,
  { headers: { 'Content-Type': 'multipart/form-data' } });
export const getDocuments   = (params) => api.get('/hostel/admin/documents', { params });
export const uploadDocument = (formData) => api.post('/hostel/admin/documents', formData,
  { headers: { 'Content-Type': 'multipart/form-data' } });
export const verifyDocument = (id, d) => api.post(`/hostel/admin/documents/${id}/verify`, d);
/** The stored file itself, through the scoped route (a Blob). */
export const downloadDocument = (id) => api.get(`/hostel/admin/documents/${id}/download`, { responseType: 'blob' });
export const deleteDocument = (id)    => api.delete(`/hostel/admin/documents/${id}`);
export const getReportTypes = ()      => api.get('/hostel/admin/reports/types');
export const getReport      = (params) => api.get('/hostel/admin/reports', { params });
/** CSV export — returns the raw text, the caller turns it into a download. */
export const exportReport   = (params) => api.get('/hostel/admin/reports/export',
  { params, responseType: 'text', transformResponse: [(d) => d] });

// ── Student / parent portal ───────────────────────────────────────────────────
const portal = (role) => ({
  myHostel:     (params)  => api.get(`/hostel/${role}/my-hostel`, { params }),
  hostels:      (params)  => api.get(`/hostel/${role}/hostels`, { params }),
  apply:        (d)       => api.post(`/hostel/${role}/apply`, d),
  attendance:   (params)  => api.get(`/hostel/${role}/attendance`, { params }),
  leaves:       (params)  => api.get(`/hostel/${role}/leaves`, { params }),
  applyLeave:   (d)       => api.post(`/hostel/${role}/leaves`, d),
  actOnLeave:   (id, d)   => api.post(`/hostel/${role}/leaves/${id}/act`, d),
  outpasses:    (params)  => api.get(`/hostel/${role}/outpasses`, { params }),
  applyOutpass: (d)       => api.post(`/hostel/${role}/outpasses`, d),
  cancelOutpass: (id)     => api.post(`/hostel/${role}/outpasses/${id}/cancel`),
  visitors:     (params)  => api.get(`/hostel/${role}/visitors`, { params }),
  requestVisitor: (d)     => api.post(`/hostel/${role}/visitors`, d),
  fees:         (params)  => api.get(`/hostel/${role}/fees`, { params }),
  complaints:   (params)  => api.get(`/hostel/${role}/complaints`, { params }),
  raiseComplaint: (d)     => api.post(`/hostel/${role}/complaints`, d),
  actOnComplaint: (id, d) => api.post(`/hostel/${role}/complaints/${id}/act`, d),
  mess:         (params)  => api.get(`/hostel/${role}/mess`, { params }),
  // "I will not be at this meal": { date, meal, undo }.
  skipMeal:     (d)       => api.post(`/hostel/${role}/mess/skip`, d),
  // Ask to change room: { reason, preference }. The office decides where.
  roomChange:   (d)       => api.post(`/hostel/${role}/room-change`, d),
  record:       (params)  => api.get(`/hostel/${role}/record`, { params }),
  uploadAttachment: (formData) => api.post(`/hostel/${role}/attachments`, formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }),
});

export const student = {
  ...portal('student'),
  outpassPass: (id) => api.get(`/hostel/student/outpasses/${id}/pass`),
};
export const parent = {
  ...portal('parent'),
  children: () => api.get('/hostel/parent/children'),
  // Consent to, or decline, a child's outpass: { action: 'parent_approve' | 'parent_reject', remark, student }.
  actOnOutpass: (id, d) => api.post(`/hostel/parent/outpasses/${id}/act`, d),
};
/** A member of staff who lives in the hostel — the student screen, for themselves. */
export const teacher = {
  ...portal('teacher'),
  outpassPass: (id) => api.get(`/hostel/teacher/outpasses/${id}/pass`),
};

// ── Paying a hostel bill (student, parent for a child, resident teacher) ─────
/** What is owed, what was paid and every receipt. `student` is for a parent only. */
export const getMyFeeSummary   = (student) => api.get('/hostel/my-fees/summary', { params: { student } });
export const createFeeOrder    = (d)       => api.post('/hostel/my-fees/order', d);
export const confirmFeePayment = (d)       => api.post('/hostel/my-fees/confirm', d);
/** The receipt document. `invoice` pins an old, repeated number to one resident. */
export const feeReceiptPath = (receiptNumber, invoice) =>
  `/hostel/receipts/${encodeURIComponent(receiptNumber)}${invoice ? `?invoice=${encodeURIComponent(invoice)}` : ''}`;

/** A refund's voucher — the receipt's counterpart, for money going back. */
export const refundVoucherPath = (voucherNumber) => `/hostel/refunds/${encodeURIComponent(voucherNumber)}`;
