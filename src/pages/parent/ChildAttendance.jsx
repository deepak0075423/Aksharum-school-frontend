/**
 * Parent → Child Attendance.
 *
 * The student's own Overview, read for one child at a time (the child switch
 * writes ?child=), and that child's correction requests to follow. A parent
 * reads: the child asks for corrections and answers the teacher's questions
 * from their own account. Standing is a rank and the class average — never
 * another child's name or figure.
 *
 * Links: notices open ?child=<id>&date=YYYY-MM-DD (a mark), ?child=&focus=<id>
 * (an alert), ?tab=requests&child=&focus=<request> (a correction).
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getChildAttendanceOverview, getChildCorrections } from '../../api/parent.api';
import { Spinner } from '../../components/ui/index';
import { ChildSwitch, useChild } from '../../components/parent/ChildSwitch';
import { Empty, Frame, todayKey } from '../../components/attendance/parts';
import {
  Alerts, DayDetail, HowItWorksCard, InsightCard, MonthCard, MonthGrid, MonthPicker,
  OverviewTiles, RecentRequestsCard, RequestsBody, StandingCard,
} from '../../components/attendance/StudentView';

const TABS = [
  { value: 'overview', label: 'Overview',            icon: 'calendar' },
  { value: 'requests', label: 'Correction Requests', icon: 'history' },
];

export default function ChildAttendance() {
  const [params, setParams] = useSearchParams();
  const linkDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : '';
  const wanted = params.get('child') || '';
  const [tab, setTab] = useState(TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview');
  const [month, setMonth] = useState((linkDate || todayKey()).slice(0, 7));
  const [day, setDay] = useState(linkDate || todayKey());

  const { data, loading, error } = useFetch(
    () => getChildAttendanceOverview({ child: wanted || undefined, month }), [wanted, month]);
  const children = data?.children || [];
  const { child, pick } = useChild(children);
  const childId = data?.child?._id || child?._id;

  const { data: requestsData, loading: reqLoading } = useFetch(
    () => (tab === 'requests' && childId ? getChildCorrections({ child: childId }) : Promise.resolve(null)), [tab, childId]);
  const requests = Array.isArray(requestsData) ? requestsData : [];

  const onTab = (value) => {
    setTab(value);
    const next = new URLSearchParams();
    if (wanted) next.set('child', wanted);
    if (value !== 'overview') next.set('tab', value);
    setParams(next, { replace: true });
  };
  const onMonth = (m) => {
    setMonth(m);
    setDay(m === todayKey().slice(0, 7) ? todayKey() : `${m}-01`);
  };

  const name = data?.student?.name || child?.name || 'your child';
  const subtitle = `How regularly ${name} attends school, day by day, and any corrections asked for.`;
  const banner = children.length
    ? <ChildSwitch children={children} child={data?.child || child} onPick={pick} label="Whose attendance" />
    : null;
  const counts = { requests: data?.requests?.awaitingReply || 0 };

  if (!loading && data && !children.length) {
    return (
      <Frame title="Child Attendance" subtitle="Attendance for your children" tabs={TABS} tab={tab} onTab={onTab}>
        <section className="tat-card"><Empty icon="users" title="No children linked">Ask the school office to link your child to your account.</Empty></section>
      </Frame>
    );
  }

  if (tab === 'requests') {
    return (
      <Frame title="Child Attendance" subtitle={subtitle} tabs={TABS} tab={tab} onTab={onTab} counts={counts} banner={banner}
        railWidth="md" railAlign="content" rail={<HowItWorksCard who="parent" />}>
        <RequestsBody requests={requests} who="parent" name={name} loading={reqLoading || (!data && loading)} onReply={null}
          emptyAction={`${name} can ask for a correction from their own account when a mark looks wrong.`} />
      </Frame>
    );
  }

  return (
    <Frame title="Child Attendance" subtitle={subtitle} tabs={TABS} tab={tab} onTab={onTab} counts={counts} banner={banner}
      actions={<MonthPicker value={month} onChange={onMonth} />}
      railWidth="md"
      rail={data?.student ? (
        <>
          <MonthCard data={data} />
          <StandingCard data={data} />
          <InsightCard data={data} who="parent" />
          <RecentRequestsCard data={data} onViewAll={() => onTab('requests')} />
        </>
      ) : null}>
      {error ? <section className="tat-card"><Empty icon="alert" title="Attendance could not be loaded">{error}</Empty></section>
        : !data?.student ? <div className="tat-center"><Spinner /></div> : (
          <div className={`tat-stack${loading ? ' tat-dim' : ''}`} data-focus-id={data.student._id}>
            <Alerts data={data} who="parent" />
            <OverviewTiles data={data} />
            <MonthGrid data={data} selected={day} onSelect={setDay} onMonth={onMonth} loading={loading} />
            <DayDetail data={data} dayKey={day} who="parent" />
          </div>
        )}
    </Frame>
  );
}
