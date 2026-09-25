/** Transport → Transport Fees. What is billed for the bus, and what is left. */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  Card, CardHead, CardBody, Rows, Empty, Loading, Tiles, Tile, Note, money,
} from '../admin/trUI';
import { InvoiceRow } from '../portal/portalParts';
import { useChildPicker, ParentPage } from './_shared';

export default function ParentFees() {
  const { studentId, picker, loading: pl, children } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api.parentInvoices({ studentId })
      .then((r) => setRows((r?.data ?? r) || []))
      .catch((e) => toast.error(e?.message || 'Could not load the invoices'))
      .finally(() => setLoading(false));
  }, [studentId]);

  const billed = rows.reduce((n, x) => n + (x.netAmount || 0), 0);
  const paid = rows.reduce((n, x) => n + (x.paidAmount || 0), 0);
  const due = Math.max(0, billed - paid);
  const overdue = rows.filter((x) => x.status === 'overdue').length;

  return (
    <ParentPage icon="wallet" iconTone={due ? 'red' : 'green'} title="Transport Fees"
                subtitle="What the bus is billed at, what has been paid, and what is left"
                picker={picker} loading={pl} children={children}
                body={loading ? <Loading /> : (
                  <>
                    <Tiles>
                      <Tile icon="wallet"   tone="indigo" label="Billed"      value={money(billed)} />
                      <Tile icon="check"    tone="green"  label="Paid"        value={money(paid)} />
                      <Tile icon="banknote" tone={due ? 'red' : 'green'} label="Outstanding" value={money(due)} />
                      <Tile icon="alert"    tone={overdue ? 'red' : 'slate'} label="Overdue" value={overdue} />
                    </Tiles>
                    {overdue ? (
                      <div style={{ marginBottom: 14 }}>
                        <Note tone="warn" title={`${overdue} invoice${overdue === 1 ? ' is' : 's are'} past due`}>
                          Transport can be suspended while fees are outstanding. Settle it at the
                          school office, or ring them if something is wrong with the bill.
                        </Note>
                      </div>
                    ) : null}
                    <Card>
                      <CardHead icon="wallet" iconTone="green" title="Invoices" sub="Newest first" />
                      <CardBody flush>
                        {rows.length
                          ? <Rows>{rows.map((x) => <InvoiceRow key={x._id || x.invoiceNumber} inv={x} />)}</Rows>
                          : (
                            <Empty icon="wallet" title="No transport invoices yet">
                              Nothing has been billed for this child&apos;s bus.
                            </Empty>
                          )}
                      </CardBody>
                    </Card>
                  </>
                )} />
  );
}
