import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Horizontal tab bar + outlet for module sections (Fees, Payroll, Library…).
 * Used as a nested layout route so every sub-page of a module is reachable
 * from anywhere inside it.
 *
 * tabs: [{ to: '/admin/fees/dashboard', label: 'Dashboard', end?: true }]
 */
export default function ModuleNav({ tabs }) {
  return (
    <>
      <div style={{ padding: '16px 24px 0', maxWidth: 1400 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </>
  );
}

export const FEES_ADMIN_TABS = [
  { to: '/admin/fees/dashboard',    label: '🏠 Dashboard' },
  { to: '/admin/fees/student-fees', label: '🧑‍🎓 Student Fees' },
  { to: '/admin/fees/payments',     label: '💳 Payments' },
  { to: '/admin/fees/structures',   label: '🏗 Structures' },
  { to: '/admin/fees/heads',        label: '📋 Fee Heads' },
  { to: '/admin/fees/categories',   label: '🗂 Categories' },
  { to: '/admin/fees/concessions',  label: '🎁 Concessions' },
  { to: '/admin/fees/fine-rules',   label: '⚠️ Fine Rules' },
  { to: '/admin/fees/reports',      label: '📈 Reports' },
  { to: '/admin/fees/settings',     label: '⚙️ Settings' },
];

export const PAYROLL_ADMIN_TABS = [
  { to: '/admin/payroll/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/payroll/runs',        label: '💼 Payroll Runs' },
  { to: '/admin/payroll/assignments', label: '🧑‍🏫 Assignments' },
  { to: '/admin/payroll/structures',  label: '🏗 Structures' },
];

// Library management tabs — used by school admins (/admin/library) and by
// teachers with the Librarian designation (/teacher/manage-library)
export const LIBRARY_MANAGE_TABS = (base) => ([
  { to: `${base}/dashboard`,    label: '🏠 Dashboard' },
  { to: `${base}/books`,        label: '📚 Books' },
  { to: `${base}/circulation`,  label: '🔄 Circulation' },
  { to: `${base}/reservations`, label: '🔖 Reservations' },
  { to: `${base}/fines`,        label: '💸 Fines' },
  { to: `${base}/reports`,      label: '📈 Reports' },
  { to: `${base}/policy`,       label: '⚙️ Policy' },
]);

export const LIBRARY_ADMIN_TABS = LIBRARY_MANAGE_TABS('/admin/library');

export const LIBRARY_STUDENT_TABS = (base) => ([
  { to: `${base}/library`,          label: '🏠 Library', end: true },
  { to: `${base}/library/search`,   label: '🔍 Search Books' },
  { to: `${base}/library/my-books`, label: '📚 My Books' },
  { to: `${base}/library/my-fines`, label: '💸 My Fines' },
]);

export const PAYROLL_TEACHER_TABS = [
  { to: '/teacher/payroll/ctc',      label: '💼 My CTC' },
  { to: '/teacher/payroll/payslips', label: '📄 Salary Slips' },
];

export const INVENTORY_ADMIN_TABS = [
  { to: '/admin/inventory/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/inventory/items',       label: '📦 Items' },
  { to: '/admin/inventory/stock',       label: '📊 Stock' },
  { to: '/admin/inventory/requests',    label: '📝 Requests' },
  { to: '/admin/inventory/orders',      label: '🧾 Purchase Orders' },
  { to: '/admin/inventory/issues',      label: '📤 Issue / Return' },
  { to: '/admin/inventory/assets',      label: '💻 Assets' },
  { to: '/admin/inventory/vendors',     label: '🏭 Vendors' },
  { to: '/admin/inventory/categories',  label: '🗂 Categories' },
  { to: '/admin/inventory/warehouses',  label: '🏬 Warehouses' },
  { to: '/admin/inventory/departments', label: '💼 Budgets' },
  { to: '/admin/inventory/audit',       label: '🧾 Activity Log' },
];

export const INVENTORY_TEACHER_TABS = [
  { to: '/teacher/inventory/requests', label: '📝 My Requests' },
];

export const TRANSPORT_ADMIN_TABS = [
  { to: '/admin/transport/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/transport/live',        label: '🛰️ Live Map' },
  { to: '/admin/transport/vehicles',    label: '🚌 Vehicles' },
  { to: '/admin/transport/staff',       label: '🧑‍✈️ Drivers & Crew' },
  { to: '/admin/transport/routes',      label: '🛣️ Routes' },
  { to: '/admin/transport/assignments', label: '🎒 Assignments' },
  { to: '/admin/transport/trips',       label: '📅 Trips' },
  { to: '/admin/transport/fuel',        label: '⛽ Fuel' },
  { to: '/admin/transport/maintenance', label: '🔧 Maintenance' },
  { to: '/admin/transport/incidents',   label: '⚠️ Incidents' },
  { to: '/admin/transport/complaints',  label: '📣 Complaints' },
  { to: '/admin/transport/fee-plans',   label: '🏷️ Fee Plans' },
  { to: '/admin/transport/invoices',    label: '💳 Invoices' },
  { to: '/admin/transport/requests',    label: '📨 Requests' },
  { to: '/admin/transport/reports',     label: '📈 Reports' },
  { to: '/admin/transport/settings',    label: '⚙️ Settings' },
  { to: '/admin/transport/audit',       label: '🧾 Activity Log' },
];

export const HOSTEL_ADMIN_TABS = [
  { to: '/admin/hostel/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/hostel/hostels',     label: '🏨 Hostels' },
  { to: '/admin/hostel/structure',   label: '🏗 Buildings & Floors' },
  { to: '/admin/hostel/rooms',       label: '🚪 Rooms & Beds' },
  { to: '/admin/hostel/occupancy',   label: '🗺 Occupancy Map' },
  { to: '/admin/hostel/admissions',  label: '📝 Admissions' },
  { to: '/admin/hostel/allocations', label: '🛏 Allocations' },
  { to: '/admin/hostel/attendance',  label: '✅ Attendance' },
  { to: '/admin/hostel/leave',       label: '🏖 Leave' },
  { to: '/admin/hostel/outpass',     label: '🎫 Outpass' },
  { to: '/admin/hostel/visitors',    label: '👋 Visitors' },
  { to: '/admin/hostel/movement',    label: '🚦 Security' },
  { to: '/admin/hostel/staff',       label: '🧑‍✈️ Warden & Staff' },
  { to: '/admin/hostel/mess',        label: '🍽 Mess' },
  { to: '/admin/hostel/fees',        label: '💳 Fees' },
  { to: '/admin/hostel/complaints',  label: '📣 Complaints' },
  { to: '/admin/hostel/maintenance', label: '🔧 Maintenance' },
  { to: '/admin/hostel/assets',      label: '📦 Assets' },
  { to: '/admin/hostel/incidents',   label: '⚠️ Incidents & Medical' },
  { to: '/admin/hostel/discipline',  label: '⚖️ Discipline' },
  { to: '/admin/hostel/documents',   label: '📁 Documents' },
  { to: '/admin/hostel/communication', label: '📢 Announcements' },
  { to: '/admin/hostel/reports',     label: '📈 Reports' },
  { to: '/admin/hostel/settings',    label: '⚙️ Settings' },
  { to: '/admin/hostel/audit',       label: '🧾 Activity Log' },
];

export const TRANSPORT_PARENT_TABS = [
  { to: '/parent/transport/track',      label: '🛰️ Track Bus' },
  { to: '/parent/transport/details',    label: '🚌 My Transport' },
  { to: '/parent/transport/attendance', label: '✅ Attendance' },
  { to: '/parent/transport/fees',       label: '💳 Fees' },
  { to: '/parent/transport/requests',   label: '📨 Requests' },
];

export const VIDEO_ADMIN_TABS = [
  { to: '/admin/videos/browse',    label: '📚 Library' },
  { to: '/admin/videos/approvals', label: '🧑‍🏫 Approvals' },
  { to: '/admin/videos/settings',  label: '⚙️ Settings' },
];

export const VIDEO_TEACHER_TABS = [
  { to: '/teacher/videos/catalog',     label: '🎥 Catalog' },
  { to: '/teacher/videos/add',         label: '➕ Add Video' },
  { to: '/teacher/videos/assignments', label: '📌 My Assignments' },
];

// ── Teacher Feedback ─────────────────────────────────────────────────────────
export const FEEDBACK_ADMIN_TABS = [
  { to: '/admin/feedback/dashboard', label: '🏠 Dashboard' },
  { to: '/admin/feedback/campaigns', label: '📣 Campaigns' },
  { to: '/admin/feedback/questions', label: '❓ Question Bank' },
  { to: '/admin/feedback/categories', label: '🗂 Categories' },
  { to: '/admin/feedback/teachers',  label: '👨‍🏫 Teacher Feedback' },
  { to: '/admin/feedback/departments', label: '🏢 Departments' },
  { to: '/admin/feedback/trends',    label: '📈 Trends' },
  { to: '/admin/feedback/reports',   label: '📄 Reports' },
  { to: '/admin/feedback/templates', label: '🧩 Templates' },
  { to: '/admin/feedback/settings',  label: '⚙️ Settings' },
];

export const FEEDBACK_TEACHER_TABS = [
  { to: '/teacher/feedback/dashboard', label: '⭐ My Feedback' },
  { to: '/teacher/feedback/breakdown', label: '🔍 Where it came from' },
  { to: '/teacher/feedback/trends',    label: '📈 Trends' },
];

// Principal view — same analytics pages as the admin, read-only, mounted under
// the teacher tree because a principal signs in as a teacher (designation-based
// RBAC, exactly like Manage Library for a Librarian).
export const FEEDBACK_PRINCIPAL_TABS = [
  { to: '/teacher/feedback-review/dashboard',   label: '🏠 Dashboard' },
  { to: '/teacher/feedback-review/teachers',    label: '👨‍🏫 Teacher Performance' },
  { to: '/teacher/feedback-review/departments', label: '🏢 Department Performance' },
  { to: '/teacher/feedback-review/trends',      label: '📈 Trends' },
  { to: '/teacher/feedback-review/reports',     label: '📄 Reports' },
];

// Timetable — the index tab is the existing per-section editor, so the manual
// workflow keeps working exactly as before; the generator lives alongside it.
export const TIMETABLE_ADMIN_TABS = [
  { to: '/admin/timetable',              label: '📋 Section Editor', end: true },
  { to: '/admin/timetable/generate',     label: '⚡ Generate' },
  { to: '/admin/timetable/versions',     label: '🗂 Versions' },
  { to: '/admin/timetable/availability', label: '🧑‍🏫 Teacher Availability' },
  { to: '/admin/timetable/rooms',        label: '🚪 Rooms' },
  { to: '/admin/timetable/configuration', label: '⚙️ Configuration' },
];

// Employee Directory — the administrative tab bar. Built from a base path so it
// serves both /admin/employee-directory and a module-admin teacher's route.
// A normal teacher has one screen and no tab bar at all (see App.jsx), because
// the workforce roll-ups are administrative and their endpoints refuse that tier.
export const DIRECTORY_TABS = (base) => ([
  { to: `${base}/dashboard`,     label: '🏠 Dashboard' },
  { to: `${base}/employees`,     label: '👥 All Employees' },
  { to: `${base}/departments`,   label: '🏢 Departments' },
  { to: `${base}/designations`,  label: '🎫 Designations' },
  { to: `${base}/org-structure`, label: '🏗 Organization' },
  { to: `${base}/verification`,  label: '🔎 Verification' },
  { to: `${base}/reports`,       label: '📈 Reports' },
]);
