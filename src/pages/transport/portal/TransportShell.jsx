/**
 * Which transport screen a teacher account gets.
 *
 * A teacher reaches Transport for one of two reasons, and they want opposite
 * screens: someone who RIDES the bus wants "where is my bus, was I on it, what
 * do I owe", and someone who CREWS it wants "what am I driving today and who is
 * on board". Until now both were sent to the rider screen, which is why a driver
 * signing in was shown an invoice list.
 *
 * `transportCrew` comes from the modules payload (utils/moduleResponse), which
 * derives it from services/transportEnrolment — the same service the route
 * guard uses, so the screen and the guard cannot disagree. This is a choice of
 * screen, not a permission: both endpoints behind it enforce their own rule.
 */
import React from 'react';
import { useModules } from '../../../contexts/ModulesContext';
import CrewDuty from './CrewDuty';
import RiderTransport from './RiderTransport';

export default function TransportShell() {
  const { modules } = useModules();
  return modules?.transportCrew ? <CrewDuty /> : <RiderTransport role="staff" />;
}
