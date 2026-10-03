/**
 * A final exam's promotion, in the exam drawer (services/resultPromotion on
 * the server): where its students go up to, when, and what happened — every
 * student who was not moved, and why.
 *
 * Until the promotion has moved anyone, it can be switched on or off, its
 * section rule changed, and what happens to the students who do not pass —
 * they stay where they are, or repeat the class next year (PUT …/options). Switching it on for a published exam
 * whose result date has come runs it there and then, so that is confirmed
 * first. After it has run, the moves are facts: withdrawing the results is what
 * takes them back.
 *
 * Once the results are out, the office may decide a student's promotion by
 * hand (Oct 2026): promote one who did not pass, on condition, or keep back
 * one who did. Where the promotion has already run, the student moves then and
 * there; undoing a decision puts them back where the result says.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { DrawerSection } from '../../../components/ui/Drawer';
import { Btn, Ico, fmtDay, fmtStamp, plural } from '../rsUI';
import { Decide } from './examDialogs';

const OUTCOME = {
  stay: 'Did not pass', noResult: 'No result', wait: 'Waiting', final: 'Passes out', passedOut: 'Passed out', skip: 'Not moved',
  promote: 'Moves up', promoted: 'Moved up', done: 'Moved up', repeat: 'Repeats the class', repeated: 'Repeats the class',
};
const MODE = { same: 'into the same section', none: 'without a section' };

/** What stands in the way, said plainly — or null when the class above is there. */
function missingLine(t) {
  if (!t) return 'This exam\'s section no longer belongs to a class.';
  if (t.missing === 'last') return 'This is the school\'s highest class, so nobody moves up from it.';
  if (t.missing === 'year') return 'There is no academic year after this one yet. Create it, with its classes, before the result date — until then the students who pass wait, and move as soon as it exists.';
  if (t.missing === 'class') return `${t.year.yearName} has no class above this one yet. Set it up before the result date — until then the students who pass wait, and move as soon as it exists.`;
  return null;
}
/** "Class 7, 2027-28 (sections A, B)" — with the section caveat when there is one. */
function targetLine(t, sameSection) {
  const s = sameSection && !t.sections.map((x) => x.toUpperCase()).includes(sameSection.toUpperCase())
    ? ` — it has no section ${sameSection}, so students go in without one` : '';
  return `${t.class.className}, ${t.year.yearName}${t.sections.length ? ` (sections ${t.sections.join(', ')})` : ' (no sections yet)'}${s}`;
}

export default function PromotionPanel({ exam, onChanged, onDialog = () => {} }) {
  const p = exam.promotion;
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [deciding, setDeciding] = useState(false);
  if (!p) return null;

  const published = exam.status === 'FINAL_APPROVED';
  const moved = ['done', 'waiting', 'running'].includes(p.state) && p.ranAt;
  const editable = !moved;
  // The server's word on whether the result date has come (a day on the school's clock).
  const dueNow = published && !exam.releaseAhead;

  const change = async (body, label) => {
    setBusy(label); setAsk(null);
    try {
      const res = await api.setFormalExamOptions(exam._id, body);
      const r = res.data?.promotion;
      toast.success(r && (r.state === 'done' || r.state === 'waiting')
        ? `${plural(r.promoted, 'student')} promoted${r.target?.class ? ` to ${r.target.class.className}` : ''}`
        : body.promoteOnPass === false ? 'Promotion switched off' : 'Promotion settings saved');
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const turnOn = () => {
    if (dueNow) {
      setAsk({
        body: <p>The results are already out, so the students who passed move up to <strong>{p.target?.class?.className || 'the next class'}</strong> now, {MODE[p.mode]}.</p>,
        run: () => change({ promoteOnPass: true }, 'on'),
      });
    } else change({ promoteOnPass: true }, 'on');
  };

  const stats = p.state === 'scheduled' || !p.state ? p.preview : p.stats;
  const repeating = p.placement === 'repeat';
  // Where the ones who repeat go: the same class, next year.
  const again = stats?.repeatTarget?.class
    ? `${stats.repeatTarget.class.className}${stats.repeatTarget.year ? `, ${stats.repeatTarget.year.yearName}` : ''}`
    : p.target?.year ? `the same class in ${p.target.year.yearName}` : 'the same class next year';
  const exceptions = (stats?.exceptions || []).filter((x) => x.outcome !== 'promoted' || x.reason);
  const shown = showAll ? exceptions : exceptions.slice(0, 6);
  const decisions = exam.promotionDecisions || [];
  const canDecide = p.enabled && published && !exam.archived;
  const decide = (on) => { setDeciding(on); onDialog(on); };
  const undo = async (d) => {
    setBusy(`undo:${d.student}`);
    try {
      await api.setPromotionDecision(exam._id, { student: d.student, decision: null });
      toast.success(`${d.name}: back to what the result says`);
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <DrawerSection title="Promotion">
      <div className="rs-dpromo">
        {!p.enabled ? (
          <>
            <p className="rs-dnote">Off — when the results are published, every student stays in their class.</p>
            {editable ? <Btn size="sm" icon="gradCap" busy={busy === 'on'} onClick={turnOn}>Promote students who pass</Btn> : null}
          </>
        ) : (
          <>
            {missingLine(p.target) ? (
              <>
                <p className="rs-dpromo__to"><Ico name="gradCap" size={16} /><span>Students who pass move up to the next class, {MODE[p.mode]}.</span></p>
                <p className="rs-dnote rs-dnote--warn">{missingLine(p.target)}</p>
              </>
            ) : (
              <p className="rs-dpromo__to"><Ico name="gradCap" size={16} /><span>Students who pass move up {MODE[p.mode]} to <strong>{targetLine(p.target, p.mode === 'same' ? p.sameSection : '')}</strong></span></p>
            )}
            <p className="rs-dpromo__to"><Ico name="refresh" size={16} />
              <span>{repeating
                ? <>Students who do not pass repeat the class, {MODE[p.mode]}: <strong>{again}</strong>. A re-exam pass moves them up after all.</>
                : <>Students who do not pass stay where they are, for the school to place.</>}
              </span>
            </p>

            {!published ? (
              <p className="rs-dnote">Runs when the results reach families{exam.publishDate ? ` — the result date, ${fmtDay(exam.publishDate)}` : ' — at publishing, as no result date is set'}.</p>
            ) : p.state === 'scheduled' ? (
              <p className="rs-dnote">Scheduled for {fmtDay(p.dueAt)}, the result date. Until then, nobody has moved.</p>
            ) : p.state === 'reverted' ? (
              <p className="rs-dnote">Undone when the results were withdrawn{p.stats?.revertedAt ? ` on ${fmtStamp(p.stats.revertedAt)}` : ''}: {plural(p.stats?.reverted || 0, 'student')} moved back{p.stats?.keptMoved ? `; ${p.stats.keptMoved} left where they had been put since` : ''}. It runs again when the results are published.</p>
            ) : null}

            {stats ? (
              <dl className="rs-dpromo__counts">
                <div><dt>{p.state === 'scheduled' || !p.state ? 'Will move up' : 'Moved up'}</dt><dd>{stats.promoted}</dd></div>
                {repeating || stats.repeated ? <div><dt>{p.state === 'scheduled' || !p.state ? 'Will repeat' : 'Repeat the class'}</dt><dd>{stats.repeated || 0}</dd></div> : null}
                {!repeating || stats.stay ? <div><dt>Did not pass</dt><dd>{stats.stay}</dd></div> : null}
                {stats.final || stats.passedOut ? <div><dt>{stats.passedOut ? 'Passed out' : 'Pass out'}</dt><dd>{(stats.final || 0) + (stats.passedOut || 0)}</dd></div> : null}
                {stats.onCondition ? <div><dt>On condition</dt><dd>{stats.onCondition}</dd></div> : null}
                {stats.detained ? <div><dt>Kept back</dt><dd>{stats.detained}</dd></div> : null}
                {stats.noDetention ? <div><dt>No-detention class</dt><dd>{stats.noDetention}</dd></div> : null}
                {stats.wait ? <div className="is-warn"><dt>Waiting</dt><dd>{stats.wait}</dd></div> : null}
                {stats.skip ? <div><dt>Not moved</dt><dd>{stats.skip}</dd></div> : null}
                {stats.noResult ? <div><dt>No result</dt><dd>{stats.noResult}</dd></div> : null}
              </dl>
            ) : null}
            {p.state === 'done' && p.ranAt ? <p className="rs-dnote">Ran {fmtStamp(p.ranAt)}.</p> : null}
            {p.state === 'waiting' ? <p className="rs-dnote rs-dnote--warn">Some students are waiting for the class above to be set up for next year. They are moved as soon as it exists — this is checked every hour.</p> : null}

            {exceptions.length ? (
              <ul className="rs-dpromo__list">
                {shown.map((x) => (
                  <li key={`${x.student}${x.outcome}`}><strong>{x.name}</strong><span>{OUTCOME[x.outcome] || x.outcome}{x.reason && x.reason !== OUTCOME[x.outcome] ? ` — ${x.reason}` : ''}</span></li>
                ))}
                {exceptions.length > 6 ? (
                  <li><button type="button" className="rs-link" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${exceptions.length}`}</button></li>
                ) : null}
              </ul>
            ) : null}

            {decisions.length ? (
              <>
                <h4 className="rs-dpromo__sub">Decided by the office</h4>
                <ul className="rs-dpromo__list">
                  {decisions.map((d) => (
                    <li key={d.student}>
                      <strong>{d.name}</strong>
                      <span>{d.decision === 'promote' ? 'Promoted on condition' : 'Kept back'}{d.reason ? ` — ${d.reason}` : ''}{d.by ? ` · ${d.by}` : ''}{d.at ? `, ${fmtStamp(d.at)}` : ''}</span>
                      {canDecide ? <Btn size="sm" kind="ghost" busy={busy === `undo:${d.student}`} disabled={!!busy} onClick={() => undo(d)}>Undo</Btn> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {canDecide ? <Btn size="sm" icon="userCircle" onClick={() => decide(true)}>Decide for a student</Btn> : null}

            {editable ? (
              <div className="rs-dpromo__acts">
                <span className="rs-review__filters" role="group" aria-label="Promote into">
                  <button type="button" className={p.mode === 'same' ? 'is-on' : ''} disabled={!!busy} onClick={() => p.mode !== 'same' && change({ promoteSection: 'same' }, 'mode')}>Same section</button>
                  <button type="button" className={p.mode === 'none' ? 'is-on' : ''} disabled={!!busy} onClick={() => p.mode !== 'none' && change({ promoteSection: 'none' }, 'mode')}>No section</button>
                </span>
                <span className="rs-review__filters" role="group" aria-label="Students who do not pass">
                  <button type="button" className={!repeating ? 'is-on' : ''} disabled={!!busy} onClick={() => repeating && change({ failedPlacement: 'stay' }, 'placement')}>Fail: stay</button>
                  <button type="button" className={repeating ? 'is-on' : ''} disabled={!!busy} onClick={() => !repeating && change({ failedPlacement: 'repeat' }, 'placement')}>Fail: repeat</button>
                </span>
                <Btn size="sm" kind="ghost" busy={busy === 'off'} onClick={() => change({ promoteOnPass: false }, 'off')}>Switch off</Btn>
              </div>
            ) : <p className="rs-dnote">The students have been moved. Withdrawing the results takes the promotion back.</p>}
          </>
        )}
      </div>

      <Modal open={!!ask} onClose={() => setAsk(null)} maxWidth={460}
        title={<span className="rs-ask__title rs-t-green"><i><Ico name="gradCap" size={18} /></i><span>Promote now</span></span>}
        footer={(
          <span className="rs-form__foot">
            <Btn onClick={() => setAsk(null)}>Cancel</Btn>
            <Btn kind="primary" onClick={() => ask?.run()}>Promote Now</Btn>
          </span>
        )}>
        <div className="rs-ask">{ask?.body}</div>
      </Modal>
      {deciding ? <Decide exam={exam} onClose={() => decide(false)} onDone={() => { decide(false); onChanged(); }} /> : null}
    </DrawerSection>
  );
}
