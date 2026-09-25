/** Transport → Boarding History. Was my child on the bus, and when. */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  Card, CardHead, CardBody, Rows, Badge, Mark, Empty, Loading, Tiles, Tile,
  fmtDate, fmtTime, pct, words,
} from '../admin/trUI';
import { BOARD_TONE, BOARD_WORD, runWord } from '../portal/portalParts';
import { useChildPicker, ParentPage } from './_shared';

export default function ParentAttendance() {
  const { studentId, picker, loading: pl, children } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api.parentAttendance({ studentId })
      .then((r) => setRows((r?.data ?? r) || []))
      .catch((e) => toast.error(e?.message || 'Could not load the history'))
      .finally(() => setLoading(false));
  }, [studentId]);

  const on = rows.filter((x) => ['boarded', 'dropped'].includes(x.status)).length;
  const missed = rows.filter((x) => ['absent', 'no_show'].includes(x.status)).length;

  return (
    <ParentPage icon="checkSquare" iconTone="green" title="Boarding History"
                subtitle="Every run, and whether your child was scanned on to it"
                picker={picker} loading={pl} children={children}
                body={loading ? <Loading /> : (
                  <>
                    <Tiles>
                      <Tile icon="bus" tone="indigo" label="Runs recorded" value={rows.length} />
                      <Tile icon="check" tone="green" label="Boarded" value={on}
                            sub={rows.length ? `${pct(on, rows.length)}% of runs` : undefined} />
                      <Tile icon="close" tone={missed ? 'red' : 'slate'} label="Missed" value={missed} />
                    </Tiles>
                    <Card>
                      <CardHead icon="checkSquare" iconTone="green" title="Run by run"
                                sub="Newest first. Boarding is scanned on the bus itself." />
                      <CardBody flush>
                        {rows.length ? (
                          <Rows>
                            {rows.map((x, i) => (
                              <div className="tr-row" key={i}>
                                <Mark name="bus" size={34} glyph={16}
                                      tone={BOARD_TONE[x.status] === 'green' ? 'green'
                                        : BOARD_TONE[x.status] === 'red' ? 'red' : 'slate'} />
                                <div className="tr-row__text">
                                  <b>{fmtDate(x.date)}</b>
                                  <span>{runWord(x.shift, x.direction)}{x.route ? ` · ${x.route}` : ''}</span>
                                </div>
                                <div className="tr-row__end">
                                  <b>{x.boardTime ? fmtTime(x.boardTime) : '—'}</b>
                                  <span>{x.dropTime ? `dropped ${fmtTime(x.dropTime)}` : 'no drop recorded'}</span>
                                </div>
                                <Badge tone={BOARD_TONE[x.status] || 'slate'}>
                                  {BOARD_WORD[x.status] || words(x.status || '')}
                                </Badge>
                              </div>
                            ))}
                          </Rows>
                        ) : (
                          <Empty icon="checkSquare" title="Nothing recorded yet">
                            Once your child has ridden the bus, every run shows up here.
                          </Empty>
                        )}
                      </CardBody>
                    </Card>
                  </>
                )} />
  );
}
