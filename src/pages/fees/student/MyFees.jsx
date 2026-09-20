/** A student's own fees. The screen itself is shared with the parent's. */
import React from 'react';
import FeesView from '../view/FeesView';

export default function StudentMyFees() {
  return <FeesView role="student" />;
}
