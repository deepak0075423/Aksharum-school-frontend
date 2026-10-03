import React from 'react';
import { useModules, useGate } from '../contexts/ModulesContext';
import { Forbidden } from '../pages/errors/ErrorPage';
import { Spinner } from './ui/index';

/**
 * The rider-facing Transport screens, for the people who actually use the bus.
 *
 * Being able to reach the module is not the same as riding: a school may have
 * Transport switched on for everyone while only forty children are enrolled.
 * `transportEnrolled` in the module payload carries the rule
 * (services/transportEnrolment.js on the server, which admits an enrolled
 * student or teacher, a parent whose child is enrolled, and the crew), the
 * sidebar hides the entry, and this stops the URL being typed in.
 *
 * Fails closed like MySectionGuard: with no module map there is no reason to
 * believe anyone is enrolled, and the endpoints refuse the data regardless —
 * the guards on /transport/{student,parent,staff}/* enforce the same rule.
 *
 * A "no" is confirmed with the server first (`useGate`): someone enrolled while
 * they were signed in is otherwise refused on the answer from before.
 */
export default function TransportEnrolledGuard({ children }) {
  const { modules, ready, failed } = useModules();
  const allowed = ready && modules?.transportEnrolled === true;
  const { pending } = useGate(allowed, 'transport');

  if (pending) return <div className="loading-page"><Spinner /></div>;
  if (allowed) return children;
  return <Forbidden reason={failed ? 'unverified' : 'not_enrolled'} what="Transport" />;
}
