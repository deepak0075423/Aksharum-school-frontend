/**
 * Health Checkups → Growth (Oct 2026): every student's latest height and
 * weight against the WHO charts, with the ones outside the usual range first.
 * The numbers are the Growth report's (services/medicalReports 'growth').
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Badge, Table, Empty, Spin, LoadError, LineTabs, Toolbar, StudentCell, useLoad, useQueryState } from '../mdUI';
import { fmtDay } from '../mdMeta';
import { ClassFilter } from './mdList';
import { useMeta } from './mdForms';

const CONCERN = ['severe_thinness', 'severe_wasting', 'obese', 'severe_stunting'];
const WATCH = ['thinness', 'wasting', 'overweight', 'risk_overweight', 'stunting', 'very_tall', 'check'];
const TABS = [
  { key: 'concern', label: 'Needs attention', test: (r) => CONCERN.includes(r.bmiBand) || CONCERN.includes(r.heightBand) },
  { key: 'watch', label: 'Keep an eye on', test: (r) => !CONCERN.includes(r.bmiBand) && !CONCERN.includes(r.heightBand) && (WATCH.includes(r.bmiBand) || WATCH.includes(r.heightBand)) },
  { key: 'healthy', label: 'Healthy', test: (r) => r.bmiBand === 'healthy' && !WATCH.includes(r.heightBand) && !CONCERN.includes(r.heightBand) },
  { key: 'none', label: 'Not measured', test: (r) => r.bmiBand === 'none' },
  { key: 'all', label: 'All', test: () => true },
];

export default function MedicalGrowth() {
  const nav = useNavigate();
  const { meta } = useMeta();
  const [q, setQ] = useQueryState({ tab: 'concern', classId: '', sectionId: '' });
  const r = useLoad(() => api.getMedReport('growth', { classId: q.classId, sectionId: q.sectionId }), { c: q.classId, s: q.sectionId });
  const d = r.data;
  const band = (k) => d?.statusMap?.[k] || { label: k, tone: 'slate' };
  const tab = TABS.find((t) => t.key === q.tab) || TABS[0];
  const rows = (d?.rows || []).filter(tab.test);
  return (
    <Page>
      <PageHead icon="ruler" tone="teal" title="Growth" subtitle={d?.subtitle || 'Each student’s latest height and weight against the WHO growth charts.'} />
      {d?.summary?.length ? <div className="mdrep-sum">{d.summary.map((x) => <div key={x.label} className={x.tone ? `md-t-${x.tone}` : ''}><span>{x.label}</span><strong>{x.value}</strong></div>)}</div> : null}
      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={TABS.map((t) => ({ key: t.key, label: t.label, count: (d?.rows || []).filter(t.test).length }))} value={tab.key} onChange={(v) => setQ({ tab: v })} /></div>
        <Toolbar><ClassFilter meta={meta} q={q} setQ={setQ} /></Toolbar>
        {r.error && !d ? <LoadError error={r.error} onRetry={r.reload} /> : !d ? <Spin /> : (
          <Table rows={rows} rowKey="studentId" minWidth={820} onRow={(x) => nav(`/admin/medical/students/${x.studentId}?tab=growth`)}
            columns={[
              { key: 'student', label: 'Student', primary: true, render: (x) => <StudentCell row={x} /> },
              { key: 'measured', label: 'Measured', render: (x) => (x.measuredOn ? fmtDay(x.measuredOn) : <span className="md-none">—</span>) },
              { key: 'hw', label: 'Height · weight', render: (x) => (x.heightCm || x.weightKg ? `${x.heightCm ?? '—'} cm · ${x.weightKg ?? '—'} kg` : '—') },
              { key: 'bmi', label: 'BMI-for-age', render: (x) => <span className="md-two"><Badge tone={band(x.bmiBand).tone} size="sm">{band(x.bmiBand).label}</Badge><em>{x.bmi ? `BMI ${x.bmi}${x.bmiCentile !== null ? ` · ${x.bmiCentile} %ile` : ''}` : x.note}</em></span> },
              { key: 'height', label: 'Height-for-age', render: (x) => (x.heightBand === 'none' ? <span className="md-none">—</span> : <span className="md-two"><Badge tone={band(x.heightBand).tone} size="sm">{band(x.heightBand).label}</Badge><em>{x.heightCentile !== null ? `${x.heightCentile} %ile` : ''}</em></span>) },
            ]}
            empty={<Empty compact title="Nobody here" />} />
        )}
      </Panel>
    </Page>
  );
}
