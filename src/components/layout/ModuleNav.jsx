import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Tabs from '../ui/Tabs';

/**
 * The section bar for a module (Fees, Payroll, Library…) plus its outlet. Used
 * as a nested layout route so every sub-page of a module is reachable from
 * anywhere inside it.
 *
 * Deliberately NOT the `.tabs` class the pages themselves use. This is module
 * navigation, not a switch between views of one screen, and borrowing the
 * underline style painted a hard rule the full width of the page — directly
 * above each page's own breadcrumb, so the two read as one confused header.
 * A rail of pills says "sections of this module" and closes itself off, which
 * leaves the page beneath it free to start with its own heading.
 *
 * tabs: [{ to: '/admin/fees/dashboard', label: 'Dashboard', end?: true }]
 * size: 'compact' for the tighter 33px pills a module's mockups draw (Hostel).
 */
export default function ModuleNav({ tabs, nowrap = false, size }) {
  // A rail with one pill in it is not navigation — there is nowhere else to
  // go. The module with a single section (the teacher's Inventory) gets its
  // page's own heading straight under the breadcrumb instead.
  if ((tabs || []).length < 2) return <Outlet />;
  return (
    <>
      <div className="modnav__wrap">
        {/* The arrays carry a leading emoji for the rail's own use; the tab
            strip is icon-and-label everywhere else, so it is dropped here.
            `nowrap` keeps a module's sections on one scrolling row, which is
            how the Inventory redesign's mockups draw them. */}
        <Tabs variant="pill" label="Module sections" wrap={!nowrap} size={size}
          items={tabs.map(t => ({ ...t, label: t.label.replace(/^[^A-Za-z]+/, '') }))} />
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

// The Payroll screens draw their OWN tab strip (pages/payroll/admin/prUI.jsx →
// SectionBar), because the redesign's mockups put it inside the page beside the
// academic-year picker rather than above it. These entries therefore feed the
// SIDEBAR's sub-items only — the payroll route does not wrap itself in
// <ModuleNav>, or the page would carry two tab bars.
export const PAYROLL_ADMIN_TABS = [
  { to: '/admin/payroll/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/payroll/runs',        label: '💼 Payroll Runs' },
  { to: '/admin/payroll/assignments', label: '🧑‍🏫 Assignments' },
  { to: '/admin/payroll/structures',  label: '🏗 Structures' },
  { to: '/admin/payroll/adjustments', label: '💳 Adjustments' },
  { to: '/admin/payroll/reports',     label: '📈 Reports' },
  { to: '/admin/payroll/settings',    label: '⚙️ Settings' },
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

// A parent's library: what each child has borrowed, and their fines. The
// child on screen rides in `?child=` so the tabs do not switch child.
export const LIBRARY_PARENT_TABS = [
  { to: '/parent/library',       label: '📚 Books', end: true },
  { to: '/parent/library/fines', label: '💸 Fines' },
];

// Sidebar sub-items only — the employee's payroll screens draw their own tab
// strip inside the page, the same way the admin ones do.
export const PAYROLL_TEACHER_TABS = [
  { to: '/teacher/payroll/ctc',      label: '💼 My Salary' },
  { to: '/teacher/payroll/payslips', label: '📄 Salary Slips' },
];

// The twelve inventory sections. Each carries an `icon` the tab strip draws —
// the redesign's mockups put one beside every tab label — while the emoji is
// what the sidebar's own sub-items use, which is why both are here.
export const INVENTORY_ADMIN_TABS = [
  { to: '/admin/inventory/dashboard',  label: '🏠 Dashboard',       icon: 'home' },
  { to: '/admin/inventory/items',      label: '📦 Items',           icon: 'package' },
  { to: '/admin/inventory/stock',      label: '📊 Stock',           icon: 'chart' },
  { to: '/admin/inventory/requests',   label: '📝 Requests',        icon: 'clipboard' },
  { to: '/admin/inventory/orders',     label: '🧾 Purchase Orders', icon: 'fileDoc' },
  { to: '/admin/inventory/issues',     label: '📤 Issue / Return',  icon: 'repeat' },
  { to: '/admin/inventory/assets',     label: '💻 Assets',          icon: 'grid' },
  { to: '/admin/inventory/vendors',    label: '🏭 Vendors',         icon: 'building' },
  { to: '/admin/inventory/categories', label: '🗂 Categories',      icon: 'folder' },
  { to: '/admin/inventory/warehouses', label: '🏬 Warehouses',      icon: 'hotel' },
  { to: '/admin/inventory/budgets',    label: '💼 Budgets',         icon: 'briefcase' },
  { to: '/admin/inventory/reports',    label: '📈 Reports',         icon: 'chart' },
  { to: '/admin/inventory/audit',      label: '🧾 Activity Log',    icon: 'history' },
];

export const INVENTORY_TEACHER_TABS = [
  { to: '/teacher/inventory/requests', label: '📝 My Requests' },
];

export const TRANSPORT_ADMIN_TABS = [
  { to: '/admin/transport/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/transport/live',        label: '🛰️ Live Map' },
  { to: '/admin/transport/vehicles',    label: '🚌 Vehicles' },
  { to: '/admin/transport/drivers',     label: '🧑‍✈️ Drivers' },
  { to: '/admin/transport/conductors',  label: '🎫 Conductors' },
  { to: '/admin/transport/crew',        label: '👥 Crew Members' },
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
  { to: '/admin/transport/activity',    label: '🧾 Activity Log' },
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

// The label is also what the breadcrumb says, so it has to match the heading on
// the page it opens — a tab reading "My Transport" over a page headed "My
// Child's Bus" reads as two different places.
export const TRANSPORT_PARENT_TABS = [
  { to: '/parent/transport/track',      label: '🛰️ Track the Bus' },
  { to: '/parent/transport/details',    label: "🚌 My Child's Bus" },
  { to: '/parent/transport/attendance', label: '✅ Boarding History' },
  { to: '/parent/transport/fees',       label: '💳 Transport Fees' },
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
//
// Five sections, down from ten. The four that went are not missing: Question
// Bank, Categories and Templates are three sizes of one job and are now views
// of Questions, while Teacher Feedback, Departments, Trends and Reports were
// four shapes of the same numbers and are now views of Insights — which also
// exports each of them.
export const FEEDBACK_ADMIN_TABS = [
  { to: '/admin/feedback/overview',  label: '🏠 Overview' },
  { to: '/admin/feedback/campaigns', label: '📣 Campaigns' },
  { to: '/admin/feedback/questions', label: '❓ Questions' },
  { to: '/admin/feedback/insights',  label: '📊 Insights' },
  { to: '/admin/feedback/settings',  label: '⚙️ Settings' },
];

export const FEEDBACK_TEACHER_TABS = [
  { to: '/teacher/feedback/dashboard', label: '⭐ My Feedback' },
  { to: '/teacher/feedback/breakdown', label: '📊 By subject & section' },
  { to: '/teacher/feedback/trends',    label: '📈 Trends' },
];

// Principal view — same analytics pages as the admin, read-only, mounted under
// the teacher tree because a principal signs in as a teacher (designation-based
// RBAC, exactly like Manage Library for a Librarian).
// The principal reads the same two analytics screens the admin does — Insights
// carries the teacher, department, source and trend views that used to be four
// separate tabs here. Campaigns, Questions and Settings are configuration and
// stay with the admin; the server refuses them either way.
export const FEEDBACK_PRINCIPAL_TABS = [
  { to: '/teacher/feedback-review/overview', label: '🏠 Overview' },
  { to: '/teacher/feedback-review/insights', label: '📊 Insights' },
];

// Timetable — the index tab is the existing per-section editor, so the manual
// workflow keeps working exactly as before; the generator lives alongside it.
export const TIMETABLE_ADMIN_TABS = [
  { to: '/admin/timetable',              label: '📋 Section Editor', end: true },
  { to: '/admin/timetable/substitutions', label: '🔁 Substitutions' },
  { to: '/admin/timetable/generate',     label: '⚡ Generate' },
  { to: '/admin/timetable/versions',     label: '🗂 Versions' },
  { to: '/admin/timetable/availability', label: '🧑‍🏫 Teacher Availability' },
  { to: '/admin/timetable/rooms',        label: '🚪 Rooms' },
  { to: '/admin/timetable/reports',      label: '📊 Reports' },
  { to: '/admin/timetable/configuration', label: '⚙️ Configuration' },
];

// Employee Directory — the administrative tab bar. Built from a base path so it
// serves both /admin/employee-directory and a module-admin teacher's route.
// A normal teacher has one screen and no tab bar at all (see App.jsx), because
// the workforce roll-ups are administrative and their endpoints refuse that tier.
export const DIRECTORY_TABS = (base) => ([
  { to: `${base}/dashboard`,     label: '🏠 Overview' },
  { to: `${base}/employees`,     label: '👥 All Employees' },
  { to: `${base}/departments`,   label: '🏢 Departments' },
  { to: `${base}/designations`,  label: '🎫 Designations' },
  { to: `${base}/org-structure`, label: '🏗 Organization' },
  { to: `${base}/verification`,  label: '🔎 Verification' },
  { to: `${base}/reports`,       label: '📈 Reports' },
]);

// ID Cards — the office's eight sections. Student cards carry the year picker,
// Generate and the history of earlier years inside the one screen.
export const IDCARD_ADMIN_TABS = [
  { to: '/admin/id-cards/dashboard',    label: '🏠 Dashboard',        icon: 'home' },
  { to: '/admin/id-cards/students',     label: '🎓 Student Cards',    icon: 'student' },
  { to: '/admin/id-cards/teachers',     label: '🧑‍🏫 Teacher Cards',   icon: 'teacher' },
  { to: '/admin/id-cards/staff',        label: '💼 Staff Cards',      icon: 'briefcase' },
  { to: '/admin/id-cards/parents',      label: '👪 Parent Cards',     icon: 'users' },
  { to: '/admin/id-cards/templates',    label: '🎨 Templates',        icon: 'sliders' },
  { to: '/admin/id-cards/verification', label: '🔎 Verification',     icon: 'shieldCheck' },
  { to: '/admin/id-cards/settings',     label: '⚙️ Settings',         icon: 'settings' },
];

// The Medical Room (Oct 2026). Student Health and Medicines are groups with a
// second row of their own (pages/medical/admin/Health.jsx).
export const MEDICAL_ADMIN_TABS = [
  { to: '/admin/medical/dashboard',    label: '🏠 Dashboard' },
  { to: '/admin/medical/requests',     label: '📨 Medical Requests' },
  { to: '/admin/medical/visits',       label: '🩺 Medical Visits' },
  { to: '/admin/medical/incidents',    label: '⚠️ Medical Incidents' },
  { to: '/admin/medical/health',       label: '❤️ Student Health' },
  { to: '/admin/medical/medicines',    label: '💊 Medicines' },
  { to: '/admin/medical/first-aid',    label: '🩹 First Aid' },
  { to: '/admin/medical/vaccinations', label: '💉 Vaccinations' },
  { to: '/admin/medical/checkups',     label: '📋 Health Checkups' },
  { to: '/admin/medical/programmes',   label: '📣 Health Programmes' },
  { to: '/admin/medical/documents',    label: '📁 Medical Documents' },
  { to: '/admin/medical/room',         label: '🛏 Medical Room Management' },
  { to: '/admin/medical/staff-health', label: '🧑‍🏫 Staff Health' },
  { to: '/admin/medical/safeguarding', label: '🛡 Safeguarding' },
  { to: '/admin/medical/privacy',      label: '🔒 Privacy & Records' },
  { to: '/admin/medical/inventory',    label: '📦 Inventory' },
  { to: '/admin/medical/equipment',    label: '🧰 Medical Equipment' },
  { to: '/admin/medical/alerts',       label: '🚨 Medical Alerts' },
  { to: '/admin/medical/reports',      label: '📈 Reports' },
  { to: '/admin/medical/settings',     label: '⚙️ Settings' },
  { to: '/admin/medical/activity',     label: '🧾 Activity Log' },
];
