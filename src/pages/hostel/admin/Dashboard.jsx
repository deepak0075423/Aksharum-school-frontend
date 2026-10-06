/**
 * Hostel → Dashboard (Sep 2026 redesign, to the user's mockup).
 *
 * Five structure tiles, four bed tiles and six cards, all from ONE call —
 * GET /hostel/admin/overview (controllers/hostelAdmin.controller.js). The
 * "All Hostels" pickers switch between per-hostel breakdowns that call already
 * returned, so they cost no round trip; the fee period, the attendance day and
 * the academic year go back to the server, and only the card that asked dims
 * while it waits.
 *
 * Every figure is counted the way the screen it links to would count it: a bed
 * is "available" only if the allocation engine would give it out, attendance
 * is in students rather than roll-call records, billed follows the billing
 * month and collected the day the money came in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { useHostelAccess } from './hsAccess';
import { useModules } from '../../../contexts/ModulesContext';
import {
  PageHead, YearPicker, NewMenu, Tiles, StatTile, Meters, MeterTile, Card, CardHead, CardSelect,
  ViewAll, Legend, Note, Mini, FigRow, Mark, Bar, Empty, DashboardSkeleton, LoadError, useBoard,
  count, money, compact, shares, pctOf, plural, stamp, shortDate, words,
} from './hsUI';
import { Donut, Columns, Keys } from './hsCharts';
import { BuildingArt, WindowArt, Dove } from './hsArt';

/* The mockup's colours for a bed's state: the donut, its legend and the tiles. */
const BED = [
  { key: 'occupied',    label: 'Occupied',    color: '#15cd9a' },
  { key: 'available',   label: 'Available',   color: '#5495fe' },
  { key: 'reserved',    label: 'Reserved',    color: '#feae01' },
  { key: 'maintenance', label: 'Maintenance', color: '#fc1f33' },
];
const BLANK_BEDS = { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0, out: 0 };
const BLANK_RES = { inside: 0, outside: 0, onLeave: 0, total: 0 };

const RANGES = [
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'year', label: 'Academic year' },
];
const DAYS = [{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }];
const FEES = [
  { key: 'billed', label: 'Billed', color: '#5b47fb' },
  { key: 'collected', label: 'Collected', color: '#1fd1a0' },
];
const SEVERITY_TONE = { low: 'slate', medium: 'sky', high: 'amber', critical: 'red' };
const METER_GREEN = '#1fc795';

/**
 * What "+ New" can start. Each lands on the screen that owns the form, with
 * `?new=` asking it to open that form straight away (../shared → useNewFromLink).
 */
const NEW_ITEMS = [
  { label: 'Set up', items: [
    { label: 'Hostel', icon: 'hostel', tone: 'violet', to: '/admin/hostel/hostels?new=1' },
    { label: 'Building', icon: 'building', tone: 'green', to: '/admin/hostel/structure?new=building' },
    { label: 'Floor', icon: 'floors', tone: 'blue', to: '/admin/hostel/structure?new=floor' },
    { label: 'Room & Beds', icon: 'door', tone: 'periwinkle', to: '/admin/hostel/rooms?new=1' },
  ] },
  { label: 'Residents', items: [
    { label: 'Hostel Application', icon: 'userPlus', tone: 'indigo', to: '/admin/hostel/admissions?new=1' },
    { label: 'Bed Allocation', icon: 'bed', tone: 'rose', to: '/admin/hostel/allocations?new=1' },
  ] },
  { label: 'Day to day', items: [
    { label: 'Visitor Entry', icon: 'user', tone: 'sky', to: '/admin/hostel/visitors?new=1' },
    { label: 'Complaint', icon: 'megaphone', tone: 'amber', to: '/admin/hostel/complaints?new=1' },
    { label: 'Work Order', icon: 'wrench', tone: 'slate', to: '/admin/hostel/maintenance?new=1' },
    { label: 'Incident Report', icon: 'alertTri', tone: 'red', to: '/admin/hostel/incidents?new=1' },
  ] },
];

/** One column of the attendance card: the figure, then its share of the roll. */
const AttCol = ({ icon, tone, value, label, pct, color }) => (
  <Link className="hs-att__col" to="/admin/hostel/attendance" aria-label={`${label}: ${count(value)}, ${pct}%`}>
    <div className="hs-att__top">
      <Mark name={icon} tone={tone} glyph={29} />
      <span className="hs-fig"><strong>{count(value)}</strong><span>{label}</span></span>
    </div>
    <div className="hs-meter">
      <Bar pct={pct} color={color} />
      <span className="hs-pct">{pct}%</span>
    </div>
  </Link>
);

export default function HostelDashboard() {
  const nav = useNavigate();
  const [year, setYear] = useState('');            // '' → the school's current year
  const [range, setRange] = useState('6m');
  const [day, setDay] = useState('today');
  const [bedHostel, setBedHostel] = useState('');
  const [resHostel, setResHostel] = useState('');
  const [pending, setPending] = useState(null);    // the card waiting on the server

  const { data, loading, error, reload } = useBoard(
    useCallback(() => api.getOverview({ year: year || undefined, range, day }), [year, range, day]),
    [year, range, day],
  );
  const busy = (card) => loading && pending === card;
  // A teacher posted to a hostel sees its day-to-day screens only, so a link
  // to a part they cannot open is left out rather than leading to a refusal.
  const { warden, may } = useHostelAccess();
  const { isEnabled } = useModules();
  const medicalOn = isEnabled('medical');
  const open = (to) => (may(to) ? to : undefined);

  // A refresh that fails keeps the last good figures on screen and says so.
  useEffect(() => {
    if (error && data) toast.error(error.message || 'The dashboard did not refresh');
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  // `years` is null until the call has answered: a picker reading "Not set"
  // over a failed load would claim the school has no academic year.
  const head = (years = null, current = '') => (
    <PageHead
      title={warden ? 'Hostel Duty' : 'Hostel Dashboard'}
      subtitle={warden ? 'Your hostel today: occupancy, roll call, leave, outpass, visitors and what needs attention.' : 'Manage hostel facilities, track occupancy, attendance, leave, outpass and more.'}
    >
      {years ? <YearPicker years={years} value={year || current} onChange={(v) => { setPending('fees'); setYear(v); }} /> : null}
      <NewMenu groups={NEW_ITEMS.map((g) => ({ ...g, items: g.items.filter((it) => may(it.to)).map((it) => ({ ...it, onSelect: () => nav(it.to) })) })).filter((g) => g.items.length)} />
    </PageHead>
  );

  if (!data) {
    return (
      <div className="hs-page">
        {error && !loading ? <>{head()}<LoadError error={error} onRetry={reload} /></> : <DashboardSkeleton />}
      </div>
    );
  }

  const d = data;
  const s = d.structure || {};
  const beds = d.beds || BLANK_BEDS;
  const hostelOptions = [
    { value: '', label: 'All Hostels' },
    ...(d.hostels || []).map((h) => ({ value: h._id, label: h.name })),
  ];
  const known = (id) => (d.hostels || []).some((h) => h._id === id);
  const hostelName = (id) => (d.hostels || []).find((h) => h._id === id)?.name || '';

  // Bed tiles: every hostel. The share of each state out of the beds in service.
  const [pOcc, pAvail, pRes, pMaint] = shares(BED.map((b) => beds[b.key]));

  // Bed Occupancy card: the picked hostel, or all of them.
  const bedPick = known(bedHostel) ? bedHostel : '';
  const bSel = bedPick ? (beds.byHostel?.[bedPick] || BLANK_BEDS) : beds;
  const occShare = shares(BED.map((b) => bSel[b.key]))[0];
  const where = bedPick ? `in ${hostelName(bedPick)}` : 'across all hostels';

  const resPick = known(resHostel) ? resHostel : '';
  const res = resPick ? (d.residence?.byHostel?.[resPick] || BLANK_RES) : (d.residence || BLANK_RES);

  const fees = d.fees || { months: [], billed: 0, collected: 0 };
  const feeRows = fees.months.map((m) => ({ ...m, title: `${m.label} ${m.year}` }));
  const first = feeRows[0]; const last = feeRows[feeRows.length - 1];

  const a = d.attendance || {};
  const roll = a.expected || 0;

  return (
    <div className="hs-page">
      {head(d.years || [], d.year)}

      {/* A warden on duty needs the residents' critical medical alerts — they are in the Medical Room (need to know). */}
      {warden && medicalOn ? (
        <Note icon="alertTri" title="Medical alerts for your residents">
          Residents with a severe allergy, a condition or a rescue medicine — what to do, and the numbers to call — are in the Medical Room. <Link to="/teacher/medical?tab=alerts">Open them</Link>.
        </Note>
      ) : null}

      <Tiles>
        <StatTile tone="violet" icon="hostel" value={s.hostels} label="Total Hostels" art={<BuildingArt />} to={open('/admin/hostel/hostels')} grow={270} />
        <StatTile tone="green" icon="building" value={s.buildings} label="Buildings" to={open('/admin/hostel/structure')} grow={205} />
        <StatTile tone="blue" icon="floors" value={s.floors} label="Floors" to={open('/admin/hostel/structure')} grow={213} />
        <StatTile tone="periwinkle" icon="door" value={s.rooms} label="Rooms" art={<WindowArt />} to="/admin/hostel/rooms" grow={255} />
        <StatTile tone="rose" icon="bed" value={s.beds} label="Total Beds" to="/admin/hostel/occupancy" grow={258} />
      </Tiles>

      {/* The mockup fills the one bar it shows — Available — in green; the
          other states keep their own colour. */}
      <Meters>
        <MeterTile tone="green" icon="checkCircle" value={beds.occupied} label="Occupied Beds" pct={pOcc} color={METER_GREEN} to="/admin/hostel/occupancy" grow={293} />
        <MeterTile tone="blue" icon="dot" value={beds.available} label="Available Beds" pct={pAvail} color={METER_GREEN} to="/admin/hostel/occupancy" grow={295} />
        <MeterTile tone="amber" icon="pencilSquare" value={beds.reserved} label="Reserved Beds" pct={pRes} color="#fbab1a" to="/admin/hostel/occupancy" grow={296} />
        <MeterTile tone="red" icon="xCircle" value={beds.maintenance} label="Maintenance Beds" pct={pMaint} color="#f5213a" to="/admin/hostel/occupancy" grow={327} />
      </Meters>

      <div className={`hs-grid ${d.fees ? 'hs-grid--a' : 'hs-grid--2'}`}>
        {/* ── Bed Occupancy ─────────────────────────────────────────────── */}
        <Card label="Bed occupancy">
          <CardHead
            icon="building" title="Bed Occupancy"
            side={<CardSelect value={bedPick} onChange={setBedHostel} options={hostelOptions} label="Hostel" width={120} />}
          />
          {(d.hostels || []).length ? (
            <div className="hs-occ">
              <div className="hs-occ__main">
                {/* The ring fills with the beds that are taken or held; the
                    bare track is what is still free. */}
                <Donut
                  total={bSel.total}
                  slices={BED.filter((b) => b.key !== 'available').map((b) => ({ key: b.key, value: bSel[b.key], color: b.color }))}
                  label={`${occShare}% of ${plural(bSel.total, 'bed')} occupied ${where}`}
                >
                  <strong>{occShare}%</strong>
                  <span>Occupied</span>
                </Donut>
                <Legend rows={BED.map((b) => ({ label: b.label, value: bSel[b.key], color: b.color }))} />
              </div>
              <Note icon="vacancy" title={`${plural(bSel.available, 'bed')} ${bSel.available === 1 ? 'is' : 'are'} available`}>
                Out of {count(bSel.total)} total {bSel.total === 1 ? 'bed' : 'beds'} {where}.
                {bSel.out ? ` ${count(bSel.out)} more ${bSel.out === 1 ? 'is' : 'are'} out of service.` : ''}
              </Note>
            </div>
          ) : (
            <Empty
              icon="hostel" title="No hostels yet"
              action={may('/admin/hostel/hostels') ? <button type="button" className="hs-btn hs-btn--primary" onClick={() => nav('/admin/hostel/hostels?new=1')}>Add a hostel</button> : null}
            >
              Add a hostel, its buildings and rooms, and its beds appear here.
            </Empty>
          )}
        </Card>

        {/* ── Monthly Fee Collection (not for a teacher on a posting — the server sends none) ── */}
        {d.fees ? (
        <Card busy={busy('fees')} label="Monthly fee collection">
          <CardHead
            icon="rupee" title="Monthly Fee Collection"
            side={<CardSelect value={range} onChange={(v) => { setPending('fees'); setRange(v); }} options={RANGES} label="Period" width={113} />}
          />
          <Columns
            data={feeRows} series={FEES} tick={compact} tip={money}
            label={first
              ? `Billed ${money(fees.billed)} and collected ${money(fees.collected)} from ${first.title} to ${last.title}`
              : 'No months to show'}
          />
          <Keys items={[{ label: 'Billed', color: FEES[0].color }, { label: 'Collected', color: FEES[1].color, text: '#13be8e' }]} />
          <div className="hs-minis">
            <Mini icon="office" tone="green" value={money(fees.billed)} label="Total Billed" />
            <Mini icon="tag" tone="amber" value={money(fees.collected)} label="Total Collected" />
          </div>
        </Card>
        ) : null}

        {/* ── Student Residence ─────────────────────────────────────────── */}
        <Card label="Student residence">
          <CardHead
            icon="people" title="Student Residence" rule
            side={<CardSelect value={resPick} onChange={setResHostel} options={hostelOptions} label="Hostel" width={96} />}
          />
          <div className="hs-rlist">
            <FigRow icon="house" tone="green" value={res.inside} label="Inside the hostel" to="/admin/hostel/allocations" />
            <FigRow icon="walker" tone="amber" value={res.outside} label="Currently outside" to="/admin/hostel/movement" />
            <FigRow icon="beach" tone="sky" value={res.onLeave} label="On leave" to="/admin/hostel/leave?status=active" />
            <FigRow icon="people" tone="lavender" value={res.total} label="Total residents" to="/admin/hostel/allocations" />
          </div>
        </Card>
      </div>

      <div className="hs-grid hs-grid--b">
        {/* ── Attendance ────────────────────────────────────────────────── */}
        <Card busy={busy('attendance')} label="Attendance">
          <CardHead
            icon="calendar" rule
            title={a.day === 'yesterday' ? "Yesterday's Attendance" : "Today's Attendance"}
            side={<CardSelect value={day} onChange={(v) => { setPending('attendance'); setDay(v); }} options={DAYS} label="Day" width={81} />}
          />
          <div className="hs-att">
            <AttCol icon="checkSquare" tone="lime" value={a.present} label="Present" pct={pctOf(a.present, roll)} color={METER_GREEN} />
            <AttCol icon="xCircle" tone="red" value={a.absent} label="Absent" pct={pctOf(a.absent, roll)} color="#f5213a" />
            <AttCol icon="clockSolid" tone="amber" value={a.late} label="Late" pct={pctOf(a.late, roll)} color="#f9a10b" />
          </div>
        </Card>

        {/* ── Recent Incidents ──────────────────────────────────────────── */}
        <Card label="Recent incidents">
          <CardHead icon="alertTri" tone="red" title="Recent Incidents" side={<ViewAll to="/admin/hostel/incidents" />} />
          {d.incidents?.length ? (
            <div className="hs-irows">
              {d.incidents.map((i) => (
                <Link key={i._id} className="hs-irow" to="/admin/hostel/incidents">
                  <Mark name="alertTri" tone={SEVERITY_TONE[i.severity] || 'slate'} glyph={15} />
                  <span className="hs-irow__text">
                    <strong>{words(i.type)}</strong>
                    <span>{[i.student, i.hostel, shortDate(i.date)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`hs-sev hs-t-${SEVERITY_TONE[i.severity] || 'slate'}`}>{words(i.severity)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty art={<Dove />} title="No incidents">Nothing reported recently.</Empty>
          )}
        </Card>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        <Card label="Recent activity">
          <CardHead icon="clock" title="Recent Activity" rule side={may('/admin/hostel/audit') ? <ViewAll to="/admin/hostel/audit" /> : null} />
          {d.activity?.length ? (
            <div className="hs-tl">
              {d.activity.map((x) => (
                <div className="hs-tl__row" key={x._id}>
                  <span className="hs-tl__rail" aria-hidden><i className="hs-tl__dot" /></span>
                  <div className="hs-tl__text">
                    <strong title={x.text}>{x.text}</strong>
                    <span>{x.who} • {stamp(x.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="clock" title="Nothing logged yet">Every change to hostels, rooms and residents is listed here.</Empty>
          )}
        </Card>
      </div>

    </div>
  );
}
