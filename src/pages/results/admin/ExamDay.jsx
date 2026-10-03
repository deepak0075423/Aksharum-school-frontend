/**
 * Admin → Results → Exam Day Plan (Oct 2026): where every student sits, and
 * who invigilates each room, for each sitting of an exam day (school-backend
 * services/resultSeating).
 *
 * Pick the day and the rooms (the timetable module's, with their capacities);
 * the plan seats students of different classes and papers side by side, fills
 * the rooms in the order picked, and gives each room invigilators who do not
 * teach a paper sat in it — the fewest duties first. It is a draft until it is
 * published: then each invigilator is told their rooms, teachers see their
 * duties on the exam schedule, and families see the seat. Print gives one
 * room to a page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Check, Empty, Ico, SelectField, fmtStamp, plural, useBoard } from '../rsUI';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (k) => { const d = new Date(`${k}T00:00:00Z`); return Number.isNaN(d.getTime()) ? k : `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const timeText = (s) => (s.startTime ? `${s.startTime}${s.endTime ? `–${s.endTime}` : ''}` : 'Time not set');
const classLine = (r) => [r?.className, r?.sectionName].filter(Boolean).join(' – ');
const roomLine = (r) => [r.roomName, r.roomNumber && r.roomNumber !== r.roomName ? `(${r.roomNumber})` : '', r.building ? `· ${r.building}` : ''].filter(Boolean).join(' ');

export default function ExamDay() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Exam Day Plan' }]);
  const [date, setDate] = useState('');
  const query = useMemo(() => (date ? { date } : {}), [date]);
  const { body, loading, error, reload } = useBoard((q) => api.getExamDay(q.date), query);
  const d = body?.data || null;
  const [picked, setPicked] = useState(() => new Set());
  const [perRoom, setPerRoom] = useState('0');
  const [busy, setBusy] = useState('');
  const [warn, setWarn] = useState(null);
  const [confirm, setConfirm] = useState('');

  // The rooms the saved plan used, ticked to start with — else none.
  useEffect(() => {
    if (!d) return;
    setPicked(new Set(d.plan?.rooms?.length ? d.plan.rooms.map(String) : []));
    setPerRoom(String(d.plan?.perRoom || 0));
    setWarn(null);
  }, [d?.date, d?.plan?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rooms = d?.rooms || [];
  const capacity = rooms.filter((r) => picked.has(r._id)).reduce((t, r) => t + r.capacity, 0);
  const biggest = Math.max(0, ...(d?.sittings || []).map((s) => s.students));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const plan = d?.plan;

  const make = async () => {
    // Rooms in the order they are listed: the plan fills them in that order.
    const ids = rooms.filter((r) => picked.has(r._id)).map((r) => r._id);
    setBusy('make');
    try {
      const res = await api.planExamDay({ date: d.date, rooms: ids, perRoom: Number(perRoom) });
      setWarn(res.data?.warnings || null);
      toast.success(plan ? 'The plan has been made again — publish it to tell the teachers' : 'Plan made — check it, then publish it to the teachers');
      reload();
    } catch (e) { toast.error(e.message || 'The plan could not be made'); } finally { setBusy(''); }
  };
  const publish = async () => {
    setBusy('publish'); setConfirm('');
    try {
      const res = await api.publishExamDay({ date: d.date });
      toast.success(`Published — ${plural(res.data?.told || 0, 'invigilator')} told; families see the seats`);
      reload();
    } catch (e) { toast.error(e.message || 'The plan could not be published'); } finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('remove'); setConfirm('');
    try { await api.removeExamDay(d.date); toast.success('Plan removed'); setWarn(null); reload(); }
    catch (e) { toast.error(e.message || 'The plan could not be removed'); } finally { setBusy(''); }
  };
  const print = () => {
    document.body.classList.add('xd-printing');
    const done = () => { document.body.classList.remove('xd-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  };

  return (
    <div className="rs-page xd-page">
      <PageHead title="Exam Day Plan" subtitle="Where every student sits, and who invigilates each room, for each sitting of an exam day.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
        {plan ? <Btn kind="tint" size="lg" icon="printer" onClick={print}>Print</Btn> : null}
      </PageHead>

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="The plan could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}
      {d && !d.date ? <div className="rs-acard"><Empty title="No exam days ahead">When an exam's papers are given days, those days can be planned here.</Empty></div> : null}

      {d?.date ? (
        <>
          <div className="rs-afilters">
            <SelectField label="Exam day" width={260} value={d.date} onChange={setDate}
              options={[...(d.days.some((x) => x.date === d.date) ? [] : [{ value: d.date, label: dayText(d.date) }]),
                ...d.days.map((x) => ({ value: x.date, label: `${dayText(x.date)} · ${plural(x.papers, 'paper')}` }))]} />
          </div>

          <section className="rs-acard">
            <header className="rs-acard__head"><div><h2>Sittings</h2><p>The papers that start at the same time are sat together</p></div></header>
            {d.sittings.length ? (
              <ul className="xd-sittings">
                {d.sittings.map((s) => (
                  <li key={s.key || 'untimed'}>
                    <strong>{timeText(s)}</strong>
                    <span>{plural(s.students, 'student')}</span>
                    <small>{s.papers.map((p) => `${p.subjectName} · ${classLine(p)} (${p.students})`).join(', ')}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="rs-dnote">No paper is sat that day.</p>}
          </section>

          <section className="rs-acard">
            <header className="rs-acard__head">
              <div><h2>Rooms</h2><p>Ticked rooms are filled in this order, up to each one's capacity</p></div>
              {rooms.length ? (
                <Btn size="sm" onClick={() => setPicked(picked.size === rooms.length ? new Set() : new Set(rooms.map((r) => r._id)))}>
                  {picked.size === rooms.length ? 'Untick All' : 'Tick All'}
                </Btn>
              ) : null}
            </header>
            {rooms.length ? (
              <>
                <ul className="xd-rooms">
                  {rooms.map((r) => (
                    <li key={r._id} className={picked.has(r._id) ? 'is-on' : undefined}>
                      <label>
                        <Check checked={picked.has(r._id)} onChange={() => toggle(r._id)} label={r.roomName} />
                        <span><strong>{roomLine(r)}</strong><small>{r.capacity} seats{r.roomType ? ` · ${r.roomType}` : ''}</small></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="xd-make">
                  <p className={capacity < biggest ? 'is-short' : undefined}>
                    {picked.size ? `${capacity} seats in ${plural(picked.size, 'room')} · ${biggest} students in the largest sitting` : 'Tick the rooms the papers are sat in'}
                    {picked.size && capacity < biggest ? ` — ${biggest - capacity} would be left without a seat` : ''}
                  </p>
                  <SelectField label="Invigilators per room" width={200} value={perRoom} onChange={setPerRoom}
                    options={[{ value: '0', label: 'By size (2 above 30)' }, { value: '1', label: 'One' }, { value: '2', label: 'Two' }, { value: '3', label: 'Three' }]} />
                  <Btn kind="primary" icon="users" busy={busy === 'make'} disabled={!picked.size || !d.sittings.length || !!busy} onClick={make}>
                    {plan ? 'Make the Plan Again' : 'Make the Plan'}
                  </Btn>
                </div>
              </>
            ) : (
              <Empty title="No rooms yet">The plan seats students in the school's rooms. <Link className="rs-link" to="/admin/timetable/rooms">Add rooms, with their capacities</Link> under Timetable.</Empty>
            )}
          </section>

          {plan ? (
            <section className="rs-acard xd-plan">
              <header className="rs-acard__head">
                <div>
                  <h2>The plan · {dayText(plan.date)}</h2>
                  <p>{plan.publishedAt ? `Published ${fmtStamp(plan.publishedAt)} — invigilators told; families see their seats` : 'A draft — nobody has been told yet'}</p>
                </div>
                <span className="xd-plan__acts">
                  <Badge tone={plan.publishedAt ? 'green' : 'amber'}>{plan.publishedAt ? 'Published' : 'Draft'}</Badge>
                  {!plan.publishedAt ? <Btn kind="primary" icon="send" busy={busy === 'publish'} disabled={!!busy} onClick={() => setConfirm('publish')}>Publish to Teachers</Btn> : null}
                  <Btn kind="ghost" icon="trash" disabled={!!busy} onClick={() => setConfirm('remove')}>Remove</Btn>
                </span>
              </header>
              {warn?.unseated || warn?.invigilatorsShort ? (
                <p className="rs-dnote rs-dnote--warn">
                  {warn.unseated ? `${plural(warn.unseated, 'student')} could not be seated — tick more rooms and make the plan again. ` : ''}
                  {warn.invigilatorsShort ? `${plural(warn.invigilatorsShort, 'invigilator')} short — not enough teachers free who do not teach those papers.` : ''}
                </p>
              ) : null}
              {plan.sittings.map((s) => (
                <div key={s.key || 'untimed'} className="xd-sitting">
                  <h3>{timeText(s)} <span>· {s.papers.map((p) => `${p.subjectName} ${classLine(p)}`).join(', ')}</span></h3>
                  <div className="xd-grid">
                    {s.rooms.map((r) => (
                      <article key={r.room} className="xd-room">
                        <header>
                          <strong>{roomLine(r)}</strong>
                          <small>{dayText(plan.date)} · {timeText(s)} · {r.seats.length} of {r.capacity} seats</small>
                          <p><Ico name="userCircle" size={14} />{r.invigilators.length ? r.invigilators.map((i) => i.name).join(', ') : 'No invigilator free'}</p>
                        </header>
                        <table>
                          <thead><tr><th>Seat</th><th>Student</th><th>Roll</th><th>Class</th><th>Paper</th></tr></thead>
                          <tbody>
                            {r.seats.map((x) => (
                              <tr key={x.seat}><td className="rs-num">{x.seat}</td><td>{x.name}</td><td className="rs-num">{x.rollNumber || '—'}</td><td>{classLine(x)}</td><td>{x.subjectName}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </article>
                    ))}
                  </div>
                  {s.unseated?.length ? (
                    <p className="rs-dnote rs-dnote--warn">Not seated ({s.unseated.length}): {s.unseated.slice(0, 12).map((x) => `${x.name} (${classLine(x)})`).join(', ')}{s.unseated.length > 12 ? '…' : ''}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      <Modal open={!!confirm} onClose={() => setConfirm('')} maxWidth={480}
        title={<span className={`rs-ask__title rs-t-${confirm === 'remove' ? 'red' : 'indigo'}`}><i><Ico name={confirm === 'remove' ? 'trash' : 'send'} size={18} /></i>{confirm === 'remove' ? 'Remove the Plan' : 'Publish to Teachers'}</span>}
        footer={<>
          <Btn onClick={() => setConfirm('')}>Cancel</Btn>
          {confirm === 'remove'
            ? <Btn kind="danger-solid" busy={busy === 'remove'} onClick={remove}>Remove Plan</Btn>
            : <Btn kind="primary" busy={busy === 'publish'} onClick={publish}>Publish</Btn>}
        </>}>
        <div className="rs-ask">
          {confirm === 'remove'
            ? <p>Remove the plan for {d?.date ? dayText(d.date) : 'this day'}?{plan?.publishedAt ? ' Its invigilators are told their duties are withdrawn, and families stop seeing the seats.' : ' It has not been published, so nobody is told.'}</p>
            : (
              <ul>
                <li>Each invigilator is told their rooms, times and papers, and sees them on their exam schedule.</li>
                <li>Students and parents see the room and seat beside each paper on the exam schedule.</li>
                <li>Making the plan again later turns it back into a draft until it is published again.</li>
              </ul>
            )}
        </div>
      </Modal>
    </div>
  );
}
