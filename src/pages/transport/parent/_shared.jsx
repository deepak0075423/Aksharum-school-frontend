/**
 * The child picker every parent transport page opens with.
 *
 * A parent with two children has two different answers to every question on
 * these screens, so the picker is not a filter bolted on at the side — it is the
 * first thing the page says, and the page says nothing until it is answered.
 * See [[project_class_pages]] for the bug this shape prevents: an endpoint that
 * quietly read only the FIRST child.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { Avatar, Empty, Loading, Note, TrHead } from '../admin/trUI';

export function useChildPicker() {
  const [children, setChildren] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.parentChildren().then((r) => {
      const list = (r?.data ?? r) || [];
      setChildren(list);
      if (list.length) setStudentId(list[0].studentId);
    }).catch((e) => toast.error(e?.message || 'Could not load your children'))
      .finally(() => setLoading(false));
  }, []);

  // One child and there is nothing to choose, so nothing is shown.
  const picker = children.length > 1 ? (
    <div className="tr-kids" role="tablist" aria-label="Which child">
      {children.map((c) => (
        <button key={c.studentId} type="button" role="tab"
                aria-selected={studentId === c.studentId}
                className={`tr-kid${studentId === c.studentId ? ' is-on' : ''}`}
                onClick={() => setStudentId(c.studentId)}>
          <Avatar name={c.name} src={c.photo} id={c.studentId} size="sm" />
          <span>
            <b>{c.name}</b>
            {c.classLabel ? <em>{c.classLabel}</em> : null}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  const only = children.length === 1 ? children[0] : null;
  return { children, studentId, setStudentId, picker, loading, only };
}

/**
 * The frame the five parent pages share: heading, child picker, and the two
 * states that come before any content — still loading, and no children at all.
 */
export function ParentPage({ icon = 'bus', iconTone = 'blue', title, subtitle, picker, loading, children: kids, body }) {
  return (
    <div className="tr-page">
      <TrHead icon={icon} iconTone={iconTone} title={title} subtitle={subtitle} />
      {picker}
      {loading ? <Loading />
        : !kids?.length ? (
          <Note tone="info" title="No children on this account">
            Transport is shown per child, and this account has none linked to it yet. The school
            office links them.
          </Note>
        ) : body}
    </div>
  );
}

export { Empty };
