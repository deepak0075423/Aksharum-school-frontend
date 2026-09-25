/**
 * The page for a URL that leads nowhere, or somewhere you may not go.
 *
 * Neither of these existed. A bad URL was `<Navigate to="/" />`, so the app
 * silently swallowed it and you could not tell a typo from a broken link; and
 * every guard bounced you to your dashboard without saying why, so a page you
 * lacked access to was indistinguishable from one that had moved. Three
 * different situations all looked like "nothing happened".
 *
 * So it always answers two questions — what happened, and why it happened to
 * YOU — and then answers the third one nobody asks out loud: what do I do now.
 * That last one is the three-column strip, and it is why a refusal here does
 * not become a message to the office.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/ui/icons';
import { LockedArt, LostArt } from './errorArt';
import './errorPage.css';

// The school's own address when it has one on file, the product's otherwise —
// the same fallback the sidebar's help card uses, so the two never offer
// different people to write to.
const SUPPORT_EMAIL = 'admin@aksharum.com';

/** Where "home" is for each kind of account. */
const HOME = {
  super_admin: '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
  parent: '/parent/dashboard',
};

/**
 * Why a door is shut, in the words of the person in front of it.
 *
 * `tips` is the strip of three. The middle one always rules something OUT,
 * because the first thing a person assumes when a page refuses them is that
 * they have done something wrong or lost an account — and for most of these
 * reasons that is not what happened.
 */
const REASONS = {
  module_disabled: {
    title: 'This module is currently disabled',
    body: (what) => (
      <>Your school has not enabled the <b>{what}</b> module, so there is nothing to
        view here right now. This is not related to your account.</>
    ),
    tips: (what) => [
      { icon: 'settings', tone: 'blue', title: 'Module is turned off', text: `${what} is currently disabled in your school.` },
      { icon: 'shieldCheck', tone: 'violet', title: 'Not a permission issue', text: 'This is not about your user role or account.' },
      { icon: 'sparkle', tone: 'green', title: 'Need this module?', text: 'Ask your school administrator to enable it.' },
    ],
    note: 'If you think this should be available, please contact your school administrator.',
  },
  designation: {
    title: 'Your role does not open this',
    body: (what) => (
      <>The <b>{what}</b> module is switched on at your school, but the designation on
        your staff record does not grant access to it.</>
    ),
    tips: (what) => [
      { icon: 'badge', tone: 'blue', title: 'It is your designation', text: `Your designation is not granted access to ${what}.` },
      { icon: 'checkCircle', tone: 'violet', title: 'The module is on', text: 'Your school has it enabled — others can use it.' },
      { icon: 'sparkle', tone: 'green', title: 'Need access?', text: 'The administrator sets which designations reach which modules.' },
    ],
    note: 'If your designation is wrong, the school administrator can change it.',
  },
  admin_only: {
    title: 'This is an administrator’s screen',
    body: (what) => (
      <>You can use this module, but <b>{what}</b> is for whoever administers it.
        Your own screens in it are unaffected.</>
    ),
    tips: () => [
      { icon: 'lock', tone: 'blue', title: 'Administrative screen', text: 'It manages the module for everyone, not just you.' },
      { icon: 'checkCircle', tone: 'violet', title: 'You still have the module', text: 'Your own pages in it work as normal.' },
      { icon: 'sparkle', tone: 'green', title: 'Need to manage it?', text: 'Ask to be given administrative access to this module.' },
    ],
    note: 'Administrative access is granted per designation by the school administrator.',
  },
  not_enrolled: {
    title: 'You are not enrolled in this service',
    body: (what) => (
      <>These screens belong to people signed up for <b>{what}</b>. Nobody has signed
        this account up for it, so there is nothing to show.</>
    ),
    tips: (what) => [
      { icon: 'userPlus', tone: 'blue', title: 'Not signed up', text: `This account is not enrolled in ${what}.` },
      { icon: 'shieldCheck', tone: 'violet', title: 'Not a permission issue', text: 'The module is available — the enrolment is what is missing.' },
      { icon: 'sparkle', tone: 'green', title: 'Want to join?', text: 'The school office arranges it, and this opens by itself.' },
    ],
    note: 'Enrolment is handled by the school office, not by your account settings.',
  },
  class_teacher: {
    title: 'You do not have a section this year',
    body: () => (
      <><b>My Section</b> belongs to the class teacher and vice class teacher of a
        section. Your record does not show you as either this academic year.</>
    ),
    tips: () => [
      { icon: 'users', tone: 'blue', title: 'No section assigned', text: 'You are not class or vice class teacher of a section.' },
      { icon: 'shieldCheck', tone: 'violet', title: 'Nothing is wrong', text: 'Every other teacher screen works as normal.' },
      { icon: 'sparkle', tone: 'green', title: 'Should you have one?', text: 'The school office assigns sections each year.' },
    ],
    note: 'If you were given a section recently, sign out and back in to refresh it.',
  },
  role: {
    title: 'This screen is for a different account',
    body: () => (
      <>The page you asked for belongs to another role at the school, and this
        account cannot open it.</>
    ),
    tips: () => [
      { icon: 'user', tone: 'blue', title: 'Wrong kind of account', text: 'This page is built for a different role.' },
      { icon: 'repeat', tone: 'violet', title: 'Hold more than one?', text: 'The account you need may be your other one.' },
      { icon: 'sparkle', tone: 'green', title: 'Think it is wrong?', text: 'The school administrator can check what your account is.' },
    ],
    note: 'If you hold several accounts here, switch to the right one from your profile menu.',
  },
  default: {
    title: 'You cannot open this page',
    body: () => <>Your account does not have access to it.</>,
    tips: () => [
      { icon: 'lock', tone: 'blue', title: 'Access denied', text: 'Something about this account does not permit it.' },
      { icon: 'shieldCheck', tone: 'violet', title: 'Nothing is broken', text: 'The rest of the site works as normal.' },
      { icon: 'sparkle', tone: 'green', title: 'Need it?', text: 'Your school administrator can tell you why.' },
    ],
    note: 'If you think this should be available, please contact your school administrator.',
  },
};

const LOST_TIPS = [
  { icon: 'search', tone: 'blue', title: 'Check the URL', text: 'Make sure the address is spelled correctly.' },
  { icon: 'externalLink', tone: 'amber', title: 'It may have moved', text: 'The page might have been moved or deleted.' },
  { icon: 'home', tone: 'green', title: 'Go to a safe place', text: 'Return to dashboard or use the menu to navigate.' },
];

export default function ErrorPage({ code = 404, reason, what, detail }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const home = HOME[user?.role] || '/';
  const forbidden = Number(code) === 403;
  const r = forbidden ? (REASONS[reason] || REASONS.default) : null;
  const subject = what || 'this';
  const tips = forbidden ? r.tips(subject) : LOST_TIPS;

  return (
    <div className="errp">
      {forbidden ? <LockedArt /> : <LostArt />}

      <h1 className="errp__title">{forbidden ? r.title : 'Page not found'}</h1>
      <p className="errp__sub">
        {forbidden ? r.body(subject) : (
          <>The page you’re looking for doesn’t exist or may have been moved.
            <br />Please check the URL or return to a valid page.</>
        )}
      </p>
      {/* The address, or the level actually granted — whichever is the fact the
          reader needs to see for themselves rather than take on trust. */}
      {detail || (!forbidden && what) ? (
        <p className="errp__detail">{detail || <code>{what}</code>}</p>
      ) : null}

      <div className="errp__tips">
        {tips.map((t) => (
          <div className="errp__tip" key={t.title}>
            <span className={`errp__tipico errp__tipico--${t.tone}${forbidden ? '' : ' is-round'}`}>
              <Icon name={t.icon} size={21} />
            </span>
            <b>{t.title}</b>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <div className="errp__acts">
        <button type="button" className="errp__btn" onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={17} />Go back
        </button>
        <Link className="errp__btn errp__btn--primary" to={home}>
          <Icon name="home" size={17} />{user ? 'Go to Dashboard' : 'Sign in'}
        </Link>
      </div>

      {forbidden ? (
        <div className="errp__note">
          <span className="errp__noteico"><Icon name="info" size={18} /></span>
          <span>{r.note}</span>
        </div>
      ) : (
        <div className="errp__note errp__note--help">
          <span className="errp__noteico errp__noteico--round"><Icon name="lifebuoy" size={19} /></span>
          <span className="errp__notetext">
            <b>Need help?</b>
            <span>If you think this is an error, please contact your school administrator.</span>
          </span>
          <a className="errp__btn errp__btn--sm"
             href={`mailto:${user?.school?.email?.trim() || SUPPORT_EMAIL}?subject=${
               encodeURIComponent(`Broken link: ${what || 'a page in the school system'}`)}`}>
            <Icon name="mail" size={16} />Contact Admin
          </a>
        </div>
      )}
    </div>
  );
}

export const NotFound = (props) => <ErrorPage code={404} {...props} />;
export const Forbidden = (props) => <ErrorPage code={403} {...props} />;
