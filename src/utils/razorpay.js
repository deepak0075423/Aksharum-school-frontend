/**
 * Razorpay checkout, shared by every module that takes a payment.
 *
 * Extracted from the fee book when library fines became payable too — a second
 * copy of "load the script, open the sheet, verify the callback" is exactly the
 * kind of thing that drifts, and payment code is a poor place for drift.
 */

/** Loads the checkout script once; resolves false if it cannot be reached. */
export function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Opens the checkout sheet and hands the gateway's response to `onVerify`.
 *
 * The amount charged is the one the server put on the order — the caller passes
 * it only so the sheet displays the right figure. Never treat a client-supplied
 * amount as authoritative on the way back.
 *
 * @returns {Promise<void>} resolves once the sheet is open, not once paid.
 */
export async function openCheckout({
  order, amount, name, description, prefillName, prefillEmail, onVerify, onDismiss, onError,
}) {
  const ok = await loadRazorpay();
  if (!ok) throw new Error('Could not reach the payment gateway. Check your connection and try again.');
  if (!order?.orderId || !order?.keyId) throw new Error('The payment could not be started');

  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amount ?? Math.round(Number(amount) * 100),
    currency: order.currency || 'INR',
    name: name || 'School',
    description: description || 'Payment',
    order_id: order.orderId,
    prefill: { name: prefillName || '', email: prefillEmail || '' },
    handler: (response) => { onVerify?.(response); },
    modal: { ondismiss: () => onDismiss?.() },
  });
  rzp.on('payment.failed', (r) =>
    onError?.(new Error(r.error?.description || 'The payment did not go through')));
  rzp.open();
}
