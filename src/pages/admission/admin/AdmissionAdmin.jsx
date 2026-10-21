/**
 * The admission office — /admin/admissions/*. The section rail, and the
 * school's admission setup loaded once for every screen beneath it.
 *
 * School admins, and teachers whose designation administers admissions
 * (AdminAreaGuard in front of this, allowModuleAdmin on the server).
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import Tabs from '../../../components/ui/Tabs';
import ModuleGuard from '../../../components/ModuleGuard';
import { ADMISSION_ADMIN_TABS } from '../../../components/layout/ModuleNav';
import { AdmissionProvider } from './parts';

export default function AdmissionAdmin() {
  return (
    <ModuleGuard module="admission" label="Admissions">
      {/* The rail is drawn at once; only the screen under it waits for the setup. */}
      <div className="modnav__wrap">
        <Tabs variant="pill" label="Module sections" wrap={false}
          items={ADMISSION_ADMIN_TABS.map((t) => ({ ...t, label: t.label.replace(/^[^A-Za-z]+/, '') }))} />
      </div>
      <AdmissionProvider>
        <Outlet />
      </AdmissionProvider>
    </ModuleGuard>
  );
}
