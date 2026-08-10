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
