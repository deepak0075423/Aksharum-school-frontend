import api from './axios';

// ── Admin: dashboard / meta / settings / reports / audit ──────────────────────
export const getDashboard = () => api.get('/transport/admin/dashboard');
export const getMeta      = () => api.get('/transport/admin/meta');
export const getSettings  = () => api.get('/transport/admin/settings');
export const updateSettings = (d) => api.put('/transport/admin/settings', d);
export const getReports   = (params) => api.get('/transport/admin/reports', { params });
export const getAudit     = (params) => api.get('/transport/admin/audit', { params });

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const getVehicles   = (params) => api.get('/transport/admin/vehicles', { params });
export const getVehicle    = (id)     => api.get(`/transport/admin/vehicles/${id}`);
export const createVehicle = (d)      => api.post('/transport/admin/vehicles', d);
export const updateVehicle = (id, d)  => api.put(`/transport/admin/vehicles/${id}`, d);
export const deleteVehicle = (id)     => api.delete(`/transport/admin/vehicles/${id}`);

// ── Staff (drivers / attendants) ──────────────────────────────────────────────
export const getStaff       = (params) => api.get('/transport/admin/staff', { params });
export const getStaffMember = (id)      => api.get(`/transport/admin/staff/${id}`);
export const createStaff    = (d)       => api.post('/transport/admin/staff', d);
export const updateStaff    = (id, d)   => api.put(`/transport/admin/staff/${id}`, d);
export const deleteStaff    = (id)      => api.delete(`/transport/admin/staff/${id}`);

// ── Routes & stops ────────────────────────────────────────────────────────────
export const getRoutes    = (params) => api.get('/transport/admin/routes', { params });
export const getRoute     = (id)     => api.get(`/transport/admin/routes/${id}`);
export const createRoute  = (d)      => api.post('/transport/admin/routes', d);
export const updateRoute  = (id, d)  => api.put(`/transport/admin/routes/${id}`, d);
export const deleteRoute  = (id)     => api.delete(`/transport/admin/routes/${id}`);
export const optimizeRoute = (id)    => api.post(`/transport/admin/routes/${id}/optimize`);

// ── Assignments & seats ───────────────────────────────────────────────────────
export const getAssignments   = (params) => api.get('/transport/admin/assignments', { params });
export const createAssignment = (d)      => api.post('/transport/admin/assignments', d);
export const updateAssignment = (id, d)  => api.put(`/transport/admin/assignments/${id}`, d);
export const setAssignmentStatus = (id, d) => api.post(`/transport/admin/assignments/${id}/status`, d);
export const getSeatMap       = (vehicleId) => api.get(`/transport/admin/seatmap/${vehicleId}`);

// ── Trips / tracking / attendance ─────────────────────────────────────────────
export const getTrips        = (params) => api.get('/transport/admin/trips', { params });
export const getLiveTrips    = ()       => api.get('/transport/admin/trips/live');
export const getTrip         = (id)     => api.get(`/transport/admin/trips/${id}`);
export const generateTrips   = (d)      => api.post('/transport/admin/trips/generate', d);
export const tripAction      = (id, d)  => api.post(`/transport/admin/trips/${id}/action`, d);
export const reachStop       = (id, d)  => api.post(`/transport/admin/trips/${id}/stop`, d);
export const markAttendance  = (id, d)  => api.post(`/transport/admin/trips/${id}/attendance`, d);
export const pushLocation    = (d)      => api.post('/transport/admin/location', d);
export const getTrail        = (params) => api.get('/transport/admin/trail', { params });

// ── Fuel ──────────────────────────────────────────────────────────────────────
export const getFuel      = (params) => api.get('/transport/admin/fuel', { params });
export const createFuel   = (d)      => api.post('/transport/admin/fuel', d);
export const deleteFuel   = (id)     => api.delete(`/transport/admin/fuel/${id}`);

// ── Maintenance ───────────────────────────────────────────────────────────────
export const getMaintenance    = (params) => api.get('/transport/admin/maintenance', { params });
export const createMaintenance = (d)      => api.post('/transport/admin/maintenance', d);
export const updateMaintenance = (id, d)  => api.put(`/transport/admin/maintenance/${id}`, d);
export const deleteMaintenance = (id)     => api.delete(`/transport/admin/maintenance/${id}`);

// ── Incidents ─────────────────────────────────────────────────────────────────
export const getIncidents   = (params) => api.get('/transport/admin/incidents', { params });
export const getIncident    = (id)     => api.get(`/transport/admin/incidents/${id}`);
export const createIncident = (d)      => api.post('/transport/admin/incidents', d);
export const updateIncident = (id, d)  => api.put(`/transport/admin/incidents/${id}`, d);

// ── Complaints ────────────────────────────────────────────────────────────────
export const getComplaints  = (params) => api.get('/transport/admin/complaints', { params });
export const getComplaint   = (id)     => api.get(`/transport/admin/complaints/${id}`);
export const createComplaint = (d)     => api.post('/transport/admin/complaints', d);
export const actOnComplaint = (id, d)  => api.post(`/transport/admin/complaints/${id}/act`, d);

// ── Fees ──────────────────────────────────────────────────────────────────────
export const getFeePlans     = ()       => api.get('/transport/admin/fee-plans');
export const createFeePlan   = (d)      => api.post('/transport/admin/fee-plans', d);
export const updateFeePlan   = (id, d)  => api.put(`/transport/admin/fee-plans/${id}`, d);
export const deleteFeePlan   = (id)     => api.delete(`/transport/admin/fee-plans/${id}`);
export const getInvoices     = (params) => api.get('/transport/admin/invoices', { params });
export const generateInvoices = (d)     => api.post('/transport/admin/invoices/generate', d);
export const payInvoice      = (id, d)  => api.post(`/transport/admin/invoices/${id}/pay`, d);
export const cancelInvoice   = (id)     => api.post(`/transport/admin/invoices/${id}/cancel`);

// ── Requests ──────────────────────────────────────────────────────────────────
export const getRequests    = (params) => api.get('/transport/admin/requests', { params });
export const actOnRequest   = (id, d)  => api.post(`/transport/admin/requests/${id}/act`, d);

// ── Admin: per-screen read models (Sep 2026 redesign) ─────────────────────────
// One call per screen. The CRUD endpoints above are still what the forms post
// to; these are what the screens read.
export const getOverview      = (params) => api.get('/transport/admin/overview', { params });
export const getLiveBoard     = (params) => api.get('/transport/admin/live-board', { params });

export const getVehicleBoard  = (params) => api.get('/transport/admin/vehicle-board', { params });
export const getVehicleDetail = (id)     => api.get(`/transport/admin/vehicle-board/${id}`);

export const getStaffBoard    = (params) => api.get('/transport/admin/staff-board', { params });
export const markStaffLeave   = (id, d)  => api.post(`/transport/admin/staff/${id}/leave`, d);
export const endStaffLeave    = (id)     => api.post(`/transport/admin/staff/${id}/leave/end`);
// Crew are employees first, and only ever that: a driver, a conductor or a
// crew member is an existing teacher/employee account given a transport role.
// No account is created from Transport — Teachers is the one place that happens.
export const getAssignableEmployees = (params) => api.get('/transport/admin/staff/employees', { params });
export const assignCrewRole   = (d)      => api.post('/transport/admin/staff/assign', d);
export const unlinkCrew       = (id)     => api.post(`/transport/admin/staff/${id}/unlink`);
export const setLocationSharing = (id, d) => api.post(`/transport/admin/staff/${id}/sharing`, d);
export const pushStaffLocation = (id, d) => api.post(`/transport/admin/staff/${id}/location`, d);
export const getStaffTrail    = (id, params) => api.get(`/transport/admin/staff/${id}/trail`, { params });
// The one endpoint a driver's or conductor's own device calls.
export const pushMyLocation   = (d)      => api.post('/transport/staff/location', d);

export const getRouteBoard    = (params) => api.get('/transport/admin/route-board', { params });

export const getAssignmentBoard = (params) => api.get('/transport/admin/assignment-board', { params });
export const bulkAssign         = (d)      => api.post('/transport/admin/assignments/bulk', d);
export const importAssignments  = (d)      => api.post('/transport/admin/assignments/import', d);
export const notifyAssignees    = (d)      => api.post('/transport/admin/assignments/notify', d);

export const getTripBoard   = (params) => api.get('/transport/admin/trip-board', { params });
export const getTripDetail  = (id)     => api.get(`/transport/admin/trip-board/${id}`);
export const scheduleTrip   = (d)      => api.post('/transport/admin/trips/schedule', d);

export const getFuelBoard = (params) => api.get('/transport/admin/fuel-board', { params });
export const bulkFuel     = (d)      => api.post('/transport/admin/fuel/bulk', d);

export const getMaintenanceBoard = (params) => api.get('/transport/admin/maintenance-board', { params });
export const getIncidentBoard    = (params) => api.get('/transport/admin/incident-board', { params });
export const getComplaintBoard   = (params) => api.get('/transport/admin/complaint-board', { params });

export const getFeePlanBoard = (params) => api.get('/transport/admin/fee-plan-board', { params });
export const approveFeePlan  = (id, d)  => api.post(`/transport/admin/fee-plans/${id}/approve`, d);

export const getInvoiceBoard = (params) => api.get('/transport/admin/invoice-board', { params });
export const remindInvoices  = (d)      => api.post('/transport/admin/invoices/remind', d);
export const invoiceReceiptUrl = (id)   => `/transport/admin/invoices/${id}/receipt`;
export const getInvoiceReceipt = (id)   => api.get(`/transport/admin/invoices/${id}/receipt`);

export const getRequestBoard = (params) => api.get('/transport/admin/request-board', { params });
export const createRequest   = (d)      => api.post('/transport/admin/requests', d);
export const flagRequest     = (id, d)  => api.post(`/transport/admin/requests/${id}/flag`, d);

export const getReportBoard   = (params) => api.get('/transport/admin/report-board', { params });
export const generateReport   = (d)      => api.post('/transport/admin/reports/generate', d);
export const saveScheduledReport = (d)   => api.post('/transport/admin/reports/schedule', d);
export const downloadReport   = (id, params) => api.get(`/transport/admin/reports/${id}/download`, { params });
export const toggleReport     = (id)     => api.post(`/transport/admin/reports/${id}/toggle`);
export const deleteReport     = (id)     => api.delete(`/transport/admin/reports/${id}`);

export const getSettingsFull    = ()  => api.get('/transport/admin/settings/full');
export const updateSettingsFull = (d) => api.put('/transport/admin/settings/full', d);
export const resetSettings      = ()  => api.post('/transport/admin/settings/reset');
export const exportTransportData = (params) => api.get('/transport/admin/settings/export', { params });
export const markBackup         = ()  => api.post('/transport/admin/settings/backup');

export const getActivity = (params) => api.get('/transport/admin/activity', { params });

// ── Parent portal ─────────────────────────────────────────────────────────────
export const parentChildren   = ()       => api.get('/transport/parent/children');
export const parentTransport  = (params) => api.get('/transport/parent/transport', { params });
export const parentTrack      = (params) => api.get('/transport/parent/track', { params });
export const parentAttendance = (params) => api.get('/transport/parent/attendance', { params });
export const parentInvoices   = (params) => api.get('/transport/parent/invoices', { params });
export const parentRequests   = ()       => api.get('/transport/parent/requests');
export const parentCreateRequest = (d)   => api.post('/transport/parent/requests', d);
export const parentComplaints = ()       => api.get('/transport/parent/complaints');
export const parentCreateComplaint = (d) => api.post('/transport/parent/complaints', d);

// ── Student self ──────────────────────────────────────────────────────────────
export const studentTransport  = ()  => api.get('/transport/student/transport');
export const studentTrack       = () => api.get('/transport/student/track');
export const studentAttendance  = () => api.get('/transport/student/attendance');
export const studentInvoices    = () => api.get('/transport/student/invoices');
export const studentComplaints  = () => api.get('/transport/student/complaints');
export const studentCreateComplaint = (d) => api.post('/transport/student/complaints', d);

// ── Staff rider — a teacher enrolled in the service ───────────────────────────
// Same shapes as the student endpoints; the server reads them off the caller's
// own user id, so one screen serves both.
export const staffTransport  = ()  => api.get('/transport/staff/transport');
export const staffTrack       = () => api.get('/transport/staff/track');
export const staffAttendance  = () => api.get('/transport/staff/attendance');
export const staffInvoices    = () => api.get('/transport/staff/invoices');
export const staffComplaints  = () => api.get('/transport/staff/complaints');
export const staffCreateComplaint = (d) => api.post('/transport/staff/complaints', d);

// ── Crew portal: a driver's, conductor's or crew member's OWN duty ───────────
// Distinct from the staff-rider endpoints above. Those answer "which bus am I
// on"; these answer "which bus am I driving, and who is on it". Everything is
// keyed on the caller, so none of them takes an id.
export const crewDuty       = ()  => api.get('/transport/crew/duty');
export const crewRoster     = (trip) => api.get('/transport/crew/roster', { params: { trip } });
export const crewSetSharing = (on) => api.post('/transport/crew/sharing', { locationSharing: on });
export const crewPushLocation = (d) => api.post('/transport/staff/location', d);
// The run, driven from the bus. Same handlers the office uses, behind a door
// that proves the trip is this crew member's.
export const crewTripAction  = (id, d) => api.post(`/transport/crew/trips/${id}/action`, d);
export const crewReachStop   = (id, d) => api.post(`/transport/crew/trips/${id}/stop`, d);
export const crewAttendance  = (id, d) => api.post(`/transport/crew/trips/${id}/attendance`, d);

// ── Admin: people who can be enrolled (students AND teachers) ────────────────
export const getEnrollable = (p) => api.get('/transport/admin/enrollable', { params: p });
