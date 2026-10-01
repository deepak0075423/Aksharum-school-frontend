/**
 * What a teacher POSTED to a hostel — its warden, assistant warden or staff —
 * sees of the hostel's management screens: the day-to-day ones, for their own
 * hostel. Setup, staff postings, the mess, fees, reports, settings and the
 * activity log stay with the module's admins.
 *
 * The server holds the real list (school-backend/middleware/hostelDesk.js) and
 * narrows every one of these to the hostels the caller is posted to; this only
 * keeps the UI from offering a page that would be refused.
 */
export const WARDEN_SECTIONS = [
  'dashboard', 'rooms', 'occupancy', 'admissions', 'allocations', 'attendance', 'leave', 'outpass', 'visitors', 'movement',
  'complaints', 'maintenance', 'assets', 'incidents', 'discipline', 'documents', 'communication',
];

/** "/admin/hostel/leave?x=1" → "leave". */
export const hostelSection = (path) => String(path || '').replace(/^\/admin\/hostel\/?/, '').split(/[/?#]/)[0] || 'dashboard';

/** May a posted warden open this hostel path? */
export const wardenMay = (path) => WARDEN_SECTIONS.includes(hostelSection(path));
