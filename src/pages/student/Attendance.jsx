/**
 * Student → My Attendance.
 *
 * Three tabs on the attendance kit the teacher's screens use:
 *   Overview      the month day by day, the year so far and where I stand
 *   Class Ranking my section ranked for the academic year
 *   My Requests   the corrections I asked for, and the questions I owe a reply
 *
 * Links: notifications open ?tab=requests&focus=<request>, a mark notice
 * ?date=YYYY-MM-DD (that month, that day picked), an alert ?focus=<me>.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getAttendanceDay, getAttendanceOverview, getClassRanking, getMyCorrections, replyCorrection, submitCorrection,
} from '../../api/student.api';
import { Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { useAuth } from '../../contexts/AuthContext';
import { Podium } from '../teacher/attendance/ClassRanking';
import {
  Card, Empty, Frame, SoftAvatar, Tile, num, todayKey,
} from '../../components/attendance/parts';
import {
  Alerts, CorrectionModal, DayDetail, HowItWorksCard, InsightCard, MonthCard, MonthGrid, MonthPicker,
  OverviewTiles, RecentRequestsCard, RequestsBody, StandingCard,
} from '../../components/attendance/StudentView';

const TABS = [
  { value: 'overview', label: 'Overview',      icon: 'calendar' },
  { value: 'ranking',  label: 'Class Ranking', icon: 'trophy' },
  { value: 'requests', label: 'My Requests',   icon: 'history' },
];
const SUBTITLE = 'Your attendance day by day, where you stand in class, and your correction requests.';
const pctTone = (p) => (p == null ? 'muted' : p >= 90 ? 'green' : p >= 75 ? 'blue' : 'red');

export default function StudentAttendance() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const linkDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : '';
  const [tab, setTab] = useState(TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview');
  const [month, setMonth] = useState((linkDate || todayKey()).slice(0, 7));
  const [day, setDay] = useState(linkDate || todayKey());
  const [asking, setAsking] = useState(null);   // the day a correction is being asked for ('' = pick one)
  const [version, setVersion] = useState(0);

  const { data, loading, error } = useFetch(() => getAttendanceOverview({ month }), [month, version]);
  const { data: requestsData, loading: reqLoading } = useFetch(
    () => (tab === 'requests' ? getMyCorrections() : Promise.resolve(null)), [tab, version]);
  const requests = Array.isArray(requestsData) ? requestsData : [];

  const onTab = (value) => {
    setTab(value);
    const next = new URLSearchParams();
    if (value !== 'overview') next.set('tab', value);
    setParams(next, { replace: true });
  };
  const onMonth = (m) => {
    setMonth(m);
    setDay(m === todayKey().slice(0, 7) ? todayKey() : `${m}-01`);
  };

  const reply = async (r, text, files) => {
    const body = new FormData();
    body.append('message', text);
    files.forEach((f) => body.append('attachments', f));
    try {
      await replyCorrection(r._id, body);
      toast.success('Reply sent to your teacher');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e?.message || 'Could not send the reply'); throw e; }
  };

  const actions = (
    <>
      {tab === 'overview' && <MonthPicker value={month} onChange={onMonth} />}
      <button type="button" className="tat-btn tat-btn--primary tat-btn--lg" onClick={() => setAsking(tab === 'overview' ? day : '')}>
        <Icon name="pencil" size={18} /> Request Correction
      </button>
    </>
  );

  const counts = { requests: data?.requests?.awaitingReply || 0 };
  const modal = (
    <CorrectionModal open={asking != null} date={asking && asking <= todayKey() && asking >= (data?.canRequestFrom || '') ? asking : ''}
      minDate={data?.canRequestFrom} onClose={() => setAsking(null)}
      loadDay={(date) => getAttendanceDay({ date })} submit={submitCorrection}
      onSaved={() => { setAsking(null); setVersion((v) => v + 1); onTab('requests'); }} />
  );

  if (tab === 'ranking') {
    return (
      <>
        <Frame title="My Attendance" subtitle={SUBTITLE} tabs={TABS} tab={tab} onTab={onTab} counts={counts} actions={actions}>
          <StudentRanking me={user?._id} mode={data?.mode} />
        </Frame>
        {modal}
      </>
    );
  }

  if (tab === 'requests') {
    return (
      <>
        <Frame title="My Attendance" subtitle={SUBTITLE} tabs={TABS} tab={tab} onTab={onTab} counts={counts} actions={actions}
          railWidth="md" railAlign="content"
          rail={<HowItWorksCard who="student" onRequest={() => setAsking('')} />}>
          <RequestsBody requests={requests} who="student" loading={reqLoading} onReply={reply}
            emptyAction="When a mark looks wrong, use Request Correction and your teacher will review it." />
        </Frame>
        {modal}
      </>
    );
  }

  return (
    <>
      <Frame title="My Attendance" subtitle={SUBTITLE} tabs={TABS} tab={tab} onTab={onTab} counts={counts} actions={actions}
        railWidth="md"
        rail={data ? (
          <>
            <MonthCard data={data} />
            <StandingCard data={data} />
            <InsightCard data={data} who="student" />
            <RecentRequestsCard data={data} onViewAll={() => onTab('requests')} />
          </>
        ) : null}>
        {error ? <section className="tat-card"><Empty icon="alert" title="Your attendance could not be loaded">{error}</Empty></section>
          : !data ? <div className="tat-center"><Spinner /></div> : (
            <div className={`tat-stack${loading ? ' tat-dim' : ''}`} data-focus-id={data.student?._id}>
              <Alerts data={data} who="student" />
              <OverviewTiles data={data} />
              <MonthGrid data={data} selected={day} onSelect={setDay} onMonth={onMonth} loading={loading} />
              <DayDetail data={data} dayKey={day} who="student" onRequest={(k) => setAsking(k)} />
            </div>
          )}
      </Frame>
      {modal}
    </>
  );
}

/** The section ranked for the academic year, with me picked out. */
function StudentRanking({ me, mode }) {
  const { data, loading, error } = useFetch(getClassRanking, []);
  const unit = mode === 'subject' ? 'classes' : 'days';
  const rows = useMemo(() => (data?.ranking || []).map((r) => ({ ...r, attended: r.present })), [data]);
  const mine = rows.find((r) => String(r.student._id) === String(me));
  const marked = rows.filter((r) => r.total > 0);
  const average = marked.length
    ? Math.round(marked.reduce((n, r) => n + r.present, 0) / Math.max(1, marked.reduce((n, r) => n + r.total, 0)) * 100)
    : null;
  const top = marked.slice(0, 3);

  if (error) return <section className="tat-card"><Empty icon="alert" title="The ranking could not be loaded">{error}</Empty></section>;
  if (loading && !data) return <div className="tat-center"><Spinner /></div>;
  if (!rows.length) {
    return <section className="tat-card"><Empty icon="trophy" title="No ranking yet">You are not in a section this year, or attendance has not been taken.</Empty></section>;
  }

  return (
    <div className="tat-stack">
      <div className="tat-tiles tat-tiles--4">
        <Tile layout="card" icon="trophy" tone="amber" value={mine?.total ? `#${mine.rank}` : '—'} label="My Rank"
          caption={`of ${rows.length} students`} />
        <Tile layout="card" icon="chart" tone="indigo" value={mine?.total ? `${mine.percentage}%` : '—'} label="My Attendance"
          caption={mine?.total ? `${num(mine.present)}/${mine.total} ${unit}` : 'Nothing marked yet'}
          captionTone={mine?.total ? (mine.percentage >= 75 ? 'green' : 'red') : undefined} />
        <Tile layout="card" icon="users" tone="green" value={average == null ? '—' : `${average}%`} label="Class Average"
          caption={mine?.total && average != null ? (mine.percentage >= average ? 'You are above it' : 'You are below it') : 'This academic year'}
          captionTone={mine?.total && average != null ? (mine.percentage >= average ? 'green' : 'red') : undefined} />
        <Tile layout="card" icon="halfDay" tone="red" value={mine?.halfDay ?? 0} label="My Half Days" caption="Count as half a day" />
      </div>

      <Card className="tat-podiumcard" icon="trophy" iconTone="gold" bareIcon title="Top 3 Students" sub="Based on attendance percentage (This Academic Year)">
        {top.length === 0
          ? <Empty icon="trophy" title="Nothing marked yet">The podium fills as registers are taken.</Empty>
          : <Podium top={top} unit={unit} />}
      </Card>

      <Card className="tat-rankcard" icon="listDots" iconTone="indigo" bareIcon title="Complete Class Ranking"
        sub="Students ranked by attendance percentage (This Academic Year)">
        <div className="tat-tablewrap">
          <table className="tat-table tat-table--rank">
            <thead>
              <tr><th>#</th><th>Student Name</th><th>Roll No</th><th className="num">Attended</th><th className="num">Half-Day</th><th className="num">Marked</th><th>Attendance %</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const self = String(r.student._id) === String(me);
                return (
                  <tr key={r.student._id} className={self ? 'is-me' : ''}>
                    <td><span className={`tat-rank${r.total && r.rank <= 3 ? ` tat-rank--${r.rank}` : ''}`}>{r.total ? r.rank : '—'}</span></td>
                    <td>
                      <span className="tat-who">
                        <SoftAvatar name={r.student.name} size={34} />
                        <b>{r.student.name}</b>
                        {self && <span className="tat-youtag">You</span>}
                      </span>
                    </td>
                    <td>{r.student.rollNumber || '—'}</td>
                    <td className="num">{num(r.present)}</td>
                    <td className="num">{r.halfDay}</td>
                    <td className="num">{r.total}</td>
                    <td>
                      <span className={`tat-pct tat-pct--${r.total ? pctTone(r.percentage) : 'muted'}`}>
                        {r.total ? `${r.percentage}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
