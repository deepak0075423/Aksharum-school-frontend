/**
 * Medical Alerts (Oct 2026) — worked out live from the records:
 *   critical  severe allergies, severe or critical conditions, emergency medication
 *   warning   expiring / expired medicine, low stock, vaccinations overdue,
 *             follow-ups due, documents expiring, service due, parents' updates
 *   info      checkups completed, vaccinations given, visits closed this week
 * An alert goes away the moment its cause is dealt with.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Person, Segmented, Empty, Spin, LoadError, Ico, useLoad } from '../mdUI';
import { ago } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';

const ICON = {
  allergy: 'alertTri', condition: 'heartPulse', emergency_medication: 'syringe', expired: 'hourglass', expiring: 'hourglass', low_stock: 'package',
  vaccination_overdue: 'syringe', follow_up: 'calendarCheck', document_expiring: 'fileDoc', maintenance: 'wrench', parent_updates: 'users',
  checkup_completed: 'clipboard', vaccination_completed: 'syringe', visit_closed: 'checkCircle',
  rescue_med: 'syringe', rescue_expired: 'hourglass', rescue_expiring: 'hourglass',
  care_plan: 'heartPulse', care_plan_review: 'calendarCheck', care_plan_unconfirmed: 'users', count_due: 'checkCircle',
};
const TONE = { critical: 'red', warning: 'amber', info: 'blue' };

export default function MedicalAlerts() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => api.getMedAlerts(), 'alerts');
  const { forms, drawer, elements } = useMedWorkspace(reload);
  const [level, setLevel] = useState('all');
  if (loading && !data) return <Page><Spin /></Page>;
  if (error && !data) return <Page><LoadError error={error} onRetry={reload} /></Page>;
  const all = [...data.critical, ...data.warning, ...data.info];
  const list = level === 'all' ? all : all.filter((a) => a.level === level);
  const open = (a) => {
    if (a.student && ['allergy', 'condition', 'emergency_medication', 'vaccination_overdue', 'checkup_completed', 'vaccination_completed'].includes(a.kind)) return nav(`/admin/medical/students/${a.student.studentId}`);
    // Rescue medicines and care plans live on the student's Emergency Care tab.
    if (a.student && /^(rescue_|care_plan)/.test(a.kind)) return nav(`/admin/medical/students/${a.student.studentId}?tab=care`);
    if (a.ref?.kind === 'item') return drawer.show('item', a.ref.id);
    if (a.ref?.kind === 'equipment') return drawer.show('equipment', a.ref.id);
    if (a.ref?.kind === 'visit' || a.ref?.kind === 'incident') return drawer.show(a.ref.kind, a.ref.id);
    if (a.kind === 'follow_up' && a.ref?.kind === 'checkup') return forms.open('followUp', { kind: 'checkup', id: a.ref.id });
    if (a.kind === 'document_expiring') return nav(`/admin/medical/documents?tab=expiring&focus=${a.ref.id}`);
    if (a.kind === 'parent_updates') return nav('/admin/medical/health/updates');
    return null;
  };
  const counts = { critical: all.filter((a) => a.level === 'critical').length, warning: all.filter((a) => a.level === 'warning').length, info: all.filter((a) => a.level === 'info').length };
  return (
    <Page>
      <PageHead icon="shieldCheck" tone="red" title="Medical Alerts" subtitle="Students staff must know on sight, and everything in the Medical Room waiting for attention. Alerts are worked out from the records, so each one clears the moment it is dealt with.">
        <Btn icon="refresh" onClick={reload}>Refresh</Btn>
      </PageHead>
      <Segmented value={level} onChange={setLevel} label="Show" options={[
        { value: 'all', label: `All (${all.length})` }, { value: 'critical', label: `Critical (${counts.critical})`, tone: 'red' },
        { value: 'warning', label: `Warnings (${counts.warning})`, tone: 'amber' }, { value: 'info', label: `Information (${counts.info})` },
      ]} />
      <Panel pad={false}>
        {list.length ? list.map((a) => (
          <button key={a.id} type="button" className={`mdx-row mdx-row--link${a.level === 'critical' ? ' is-emergency' : ''}`} onClick={() => open(a)}>
            <span className={`md-panel__mark md-t-${TONE[a.level]}`}><Ico name={ICON[a.kind] || 'alert'} size={17} /></span>
            <span className="mdx-row__main">
              <b>{a.title}</b>
              <em>{a.detail}</em>
            </span>
            {a.student ? <Person name={a.student.studentName} photo={a.student.studentPhoto} size={30} sub={a.student.classLabel} /> : null}
            <span className="mdx-row__side">
              <Badge tone={TONE[a.level]} size="sm">{a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Warning' : 'Information'}</Badge>
              {a.at ? <em>{ago(a.at)}</em> : null}
            </span>
          </button>
        )) : <Empty compact title="No alerts">Nothing needs attention right now.</Empty>}
      </Panel>
      {elements}
    </Page>
  );
}
