/**
 * Teacher → By subject & section.
 *
 * The teacher's own results cut two ways. Each slice needs the response floor
 * on its own, and the server also withholds a visible slice when showing it
 * would let a smaller hidden one be worked out by subtraction from the total —
 * so a slice can be missing for either reason, and this page says which.
 */
import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { Spinner } from '../../../components/ui/index';
import {
  CatBars, Crumbs, EmptyState, Hero, Muted, NoteBar, Panel, Row, Stat, Stats, Tag, fmtDate,
} from '../admin/fbUI';
import { CampaignSelect, LockedResults, SliceList } from '../shared/roleParts';

const TRAIL = [{ to: '/teacher/feedback/dashboard', label: 'My Feedback' }];

export default function TeacherBreakdown() {
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getTeacherBreakdown(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage">
        <Crumbs trail={TRAIL} here="By subject & section" />
        <NoteBar tone="red" icon="alert">{error}</NoteBar>
      </div>
    );
  }
  if (!data?.campaign) {
    return (
      <div className="fbpage">
        <Crumbs trail={TRAIL} here="By subject & section" />
        <Hero icon="layers" title="By Subject & Section" subtitle="Your results split by what you teach and where." />
        <div className="fbcard">
          <EmptyState icon="📋" title="No feedback to show yet"
            message="Once a campaign that includes you has collected responses, they are broken down here." />
        </div>
      </div>
    );
  }

  const s = data.summary;
  const min = s.minimumResponses;
  const c = data.campaign;
  const shownSubjects = data.bySubject.filter((x) => !x.locked);
  const shownSections = data.bySection.filter((x) => !x.locked);
  const protectedCount = [...data.bySubject, ...data.bySection].filter((x) => x.protectsOthers).length;
  const best = [...shownSubjects].sort((a, b) => b.rating - a.rating)[0];

  return (
    <div className="fbpage">
      <Crumbs trail={TRAIL} here="By subject & section" />

      <Hero icon="layers" tone="purple" title="By Subject & Section"
        subtitle="Your results split by what you teach and where you teach it.">
        <CampaignSelect campaigns={data.campaigns} value={campaignId || c._id} onChange={setCampaignId} />
      </Hero>

      <div className="fbtagrow">
        <Tag tone={c.status === 'active' ? 'green' : 'blue'}>{c.status === 'active' ? 'Collecting' : 'Completed'}</Tag>
        <Tag tone="slate" icon="calendar">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</Tag>
        <Tag tone="slate">Each slice shown from {min} responses</Tag>
      </div>

      {s.locked ? (
        <LockedResults responses={s.responses} minimum={min} assigned={s.assigned} campaignOpen={c.status === 'active'} />
      ) : (
        <>
          <Stats>
            <Stat icon="book" tone="purple" value={data.bySubject.length} label="Subjects"
              caption={`${shownSubjects.length} with results showing`} />
            <Stat icon="grid" tone="blue" value={data.bySection.length} label="Sections"
              caption={`${shownSections.length} with results showing`} />
            <Stat icon="trophy" tone="amber" value={best ? best.rating.toFixed(1) : '—'} label="Best Subject"
              caption={best ? best.name : 'No subject is showing yet'} />
            <Stat icon="trending" tone="green" value={`${s.responseRate}%`} label="Response Rate"
              caption={`${s.responses} of ${s.assigned} students answered`} />
          </Stats>

          <Row split="2">
            <Panel icon="book" tone="purple" title="By Subject" subtitle="Your average out of 5 in each subject">
              {shownSubjects.length > 1
                ? <CatBars colored max={5} labelWidth={140}
                    data={shownSubjects.map((x) => ({ label: x.name, value: Number(x.rating.toFixed(1)) }))} />
                : null}
              <SliceList slices={data.bySubject} minimum={min} empty="No subject data for this campaign." />
            </Panel>

            <Panel icon="grid" tone="blue" title="By Section" subtitle="Your average out of 5 in each class section">
              {shownSections.length > 1
                ? <CatBars max={5} labelWidth={140} color="#38bdf8"
                    data={shownSections.map((x) => ({ label: x.name, value: Number(x.rating.toFixed(1)) }))} />
                : null}
              <SliceList slices={data.bySection} minimum={min} empty="No section data for this campaign." />
            </Panel>
          </Row>

          {data.bySubject.length <= 1 && data.bySection.length <= 1 && (
            <Muted>You were evaluated on one subject in one section, so there is nothing to split — your full results are on My Feedback.</Muted>
          )}
        </>
      )}

      <NoteBar tone="purple" icon="key"
        title={protectedCount ? `${protectedCount} slice${protectedCount === 1 ? ' is' : 's are'} hidden to protect others.` : null}>
        A slice with fewer than {min} responses is never shown. A slice can also be hidden even with enough
        responses, when showing it next to your overall result would let a smaller group’s average be worked out by
        subtraction. Both rules keep every student anonymous.
      </NoteBar>
    </div>
  );
}
