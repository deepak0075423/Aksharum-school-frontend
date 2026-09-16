/**
 * Admin → Attendance → Overview.
 *
 * The school's day: today's register (TodayAttendance.jsx) beside what just
 * happened — registers taken, corrections made and staff requests raised.
 *
 * Nothing here is the admin's own attendance. Clocking in and out, a personal
 * history and regularization requests belong to the teacher role, so an admin
 * who also teaches does them from their teacher post (TeacherPostNote in
 * Attendance.jsx points the way).
 */
import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { getAttendanceActivity } from '../../../api/admin.api';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Drawer, ago } from '../listParts';
import { ActivityRow, Card, EmptyNote } from '../attendanceParts';

function ActivityCard({ version, onOpen }) {
  const [all, setAll] = useState(false);
  const { data, loading } = useFetch(() => getAttendanceActivity({ limit: 5 }), [version]);
  const { data: more, loading: loadingMore } = useFetch(
    () => (all ? getAttendanceActivity({ limit: 40 }) : Promise.resolve(null)), [all, version]);
  const items = Array.isArray(data) ? data : [];
  const open = (item) => { setAll(false); onOpen(item); };

  return (
    <Card className="atn-feed" title="Recent Activity"
      actions={<button type="button" className="atn-textbtn" onClick={() => setAll(true)}>View all <Icon name="arrowRight" size={15} /></button>}>
      {loading && !items.length ? <div className="atn-center"><Spinner /></div>
        : items.length === 0 ? <EmptyNote icon="activity" title="Nothing yet">Registers, corrections and requests will show up here.</EmptyNote>
        : <div className="atn-acts">{items.map((it) => <ActivityRow key={it.id} item={it} onOpen={onOpen} ago={ago} />)}</div>}

      <Drawer open={all} onClose={() => setAll(false)}>
        <div className="ldrawer__head">
          <span className="atn-drawer__mark"><Icon name="activity" size={22} /></span>
          <div className="ldrawer__id"><h3>Recent activity</h3><p>Registers, corrections and requests across the school</p></div>
          <button type="button" className="lact" onClick={() => setAll(false)} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <div className="ldrawer__body">
          {loadingMore ? <Spinner /> : (
            <div className="atn-acts">
              {(Array.isArray(more) ? more : []).map((it) => <ActivityRow key={it.id} item={it} onOpen={open} ago={ago} />)}
            </div>
          )}
        </div>
      </Drawer>
    </Card>
  );
}

export default function Overview({ version, onActivity, today }) {
  return (
    <div className="atn-body">
      <div className="atn-main">{today}</div>
      <aside className="atn-rail">
        <ActivityCard version={version} onOpen={onActivity} />
      </aside>
    </div>
  );
}
