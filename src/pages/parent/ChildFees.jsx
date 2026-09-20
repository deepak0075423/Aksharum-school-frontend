/**
 * One child's fees. The same screen the student sees, with a child picker —
 * a fee book belongs to one child, so there is no combined view.
 */
import React from 'react';
import FeesView from '../fees/view/FeesView';

export default function ParentChildFees() {
  return <FeesView role="parent" />;
}
