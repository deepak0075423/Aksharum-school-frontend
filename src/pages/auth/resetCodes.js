/**
 * What the password-reset code page needs to carry on: the address, and when
 * it may ask for another code — 60 seconds apart, three in a row, then a day
 * (school-backend services/resetCodeLimit). `resendAt` is a moment, not a
 * count, so a reload of the page still counts down from the right place.
 *
 * `d` is a /auth/forgot-password answer: a success, or an OTP_WAIT / OTP_LIMIT
 * refusal (which carry `retryAfter` instead of `resendIn`). With nothing to go
 * on — the page opened without it — a code counts as just sent: the page
 * always opens on the full minute's countdown, never on "Resend".
 */
const RESEND_SECONDS = 60;

export const codePageState = (email, d) => ({
  email,
  resendAt:    Date.now() + (Number(d?.resendIn ?? d?.retryAfter ?? RESEND_SECONDS) || 0) * 1000,
  sendsLeft:   d?.sendsLeft ?? null,
  maxSends:    d?.maxSends ?? 3,
  availableAt: d?.availableAt || null,
});
