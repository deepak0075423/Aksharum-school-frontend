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
