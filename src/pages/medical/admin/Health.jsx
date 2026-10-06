/**
 * Student Health (Oct 2026) — the group of screens about students' records:
 * profiles, allergies, conditions, the history, emergency information and the
 * parents' updates. One sub-navigation over all of them.
 */
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Tabs from '../../../components/ui/Tabs';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';

export const HEALTH_TABS = [
  { to: '/admin/medical/health/profiles', label: 'Medical Profiles' },
  { to: '/admin/medical/health/allergies', label: 'Allergies' },
  { to: '/admin/medical/health/conditions', label: 'Medical Conditions' },
  { to: '/admin/medical/health/care-plans', label: 'Care Plans' },
  { to: '/admin/medical/health/rescue-medicines', label: 'Rescue Medicines' },
  { to: '/admin/medical/health/restrictions', label: 'Restrictions' },
  { to: '/admin/medical/health/return-to-school', label: 'Return to School' },
  { to: '/admin/medical/health/consents', label: 'Consents' },
  { to: '/admin/medical/health/history', label: 'Medical History' },
  { to: '/admin/medical/health/emergency', label: 'Emergency Information' },
  { to: '/admin/medical/health/updates', label: 'Parent Updates' },
];

export const MEDICINE_TABS = [
  { to: '/admin/medical/medicines/inventory', label: 'Medicine Inventory' },
  { to: '/admin/medical/medicines/administration', label: 'Medication Administration' },
  { to: '/admin/medical/medicines/history', label: 'Medication History' },
  { to: '/admin/medical/medicines/places', label: 'Places & Kits' },
  { to: '/admin/medical/medicines/reorder', label: 'Reorder & Costs' },
  { to: '/admin/medical/medicines/disposal', label: 'Disposal & Fridge' },
];

// The first tab of these groups is the group's own address (old links keep working), so it matches exactly.
export const VACCINATION_TABS = [
  { to: '/admin/medical/vaccinations', label: 'Vaccination Records', end: true },
  { to: '/admin/medical/vaccinations/coverage', label: 'Schedule & Coverage' },
];

export const CHECKUP_TABS = [
  { to: '/admin/medical/checkups', label: 'Health Checkups', end: true },
  { to: '/admin/medical/checkups/growth', label: 'Growth' },
  { to: '/admin/medical/checkups/referrals', label: 'Referrals' },
];

export const PROGRAMME_TABS = [
  { to: '/admin/medical/programmes/campaigns', label: 'Campaigns' },
  { to: '/admin/medical/programmes/outbreaks', label: 'Outbreak Watch' },
  { to: '/admin/medical/programmes/off-sick', label: 'Off Sick' },
];

/** The second row of navigation inside a group — and the last step of the crumb,
 *  which would otherwise be the URL's word ("Updates", not "Parent Updates"). */
export function SubNav({ tabs }) {
  const { pathname } = useLocation();
  const here = tabs.find((t) => pathname === t.to || (!t.end && pathname.startsWith(`${t.to}/`)));
  usePageCrumbs(here ? [{ label: here.label }] : []);
  return (
    <div className="md-subnav">
      <Tabs variant="line" className="md-tabs" label="Sections" wrap={false} items={tabs} />
    </div>
  );
}

export default function HealthGroup() {
  return <><SubNav tabs={HEALTH_TABS} /><Outlet /></>;
}

export function MedicinesGroup() {
  return <><SubNav tabs={MEDICINE_TABS} /><Outlet /></>;
}

export function VaccinationsGroup() {
  return <><SubNav tabs={VACCINATION_TABS} /><Outlet /></>;
}

export function CheckupsGroup() {
  return <><SubNav tabs={CHECKUP_TABS} /><Outlet /></>;
}

export function ProgrammesGroup() {
  return <><SubNav tabs={PROGRAMME_TABS} /><Outlet /></>;
}
