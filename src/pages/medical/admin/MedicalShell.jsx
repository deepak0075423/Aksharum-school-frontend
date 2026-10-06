/**
 * The frame round every /admin/medical page: the module's tab strip and the
 * ONE "confirm it is you" host (../stepUp.jsx). It lives here rather than on
 * each page so a page whose very first request is refused still gets the code
 * prompt (the dashboard used to show "no access" instead), and two mounted
 * hosts never stack two dialogs.
 */
import React from 'react';
import ModuleNav, { MEDICAL_ADMIN_TABS } from '../../../components/layout/ModuleNav';
import { StepUpHost } from '../stepUp';

export default function MedicalShell() {
  return <><StepUpHost /><ModuleNav tabs={MEDICAL_ADMIN_TABS} /></>;
}
