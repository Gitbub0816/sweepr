// Transactional email template builders. These return inline-styled HTML
// strings (email clients require inline CSS) plus a subject line. Actual
// delivery happens in the worker via MailerSend.

import { formatCurrency, formatDateTime } from "./format";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SEAFOAM = "#14b8a6";
const CHARCOAL = "#1a1a2e";

export interface EmailContent {
  subject: string;
  html: string;
}

function layout(opts: { heading: string; body: string; cta?: { label: string; href: string } }): string {
  const cta = opts.cta
    ? `<a href="${opts.cta.href}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:${SEAFOAM};color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px">${opts.cta.label}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f8fafb;font-family:Inter,Arial,sans-serif;color:${CHARCOAL}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06)">
        <tr><td style="background:${SEAFOAM};padding:24px 32px">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Sweepr</span>
        </td></tr>
        <tr><td style="padding:36px 32px">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:${CHARCOAL}">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:#475569">${opts.body}</div>
          ${cta}
        </td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid #eef2f5;font-size:12px;color:#94a3b8">
          Sweepr, Inc. &middot; You're receiving this because you have a Sweepr account.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function bookingConfirmedEmail(data: {
  customerName: string;
  bookingId: string;
  scheduledAt: Date;
  total: number;
  address: string;
}): EmailContent {
  return {
    subject: "Your Sweepr cleaning is confirmed 🧼",
    html: layout({
      heading: `You're all set, ${escHtml(data.customerName)}!`,
      body: `
        <p>Your cleaning is booked and confirmed.</p>
        <p><strong>When:</strong> ${formatDateTime(data.scheduledAt.toISOString())}<br/>
        <strong>Where:</strong> ${escHtml(data.address)}<br/>
        <strong>Total:</strong> ${formatCurrency(data.total)}</p>
        <p>Booking reference: <code>${escHtml(data.bookingId)}</code></p>`,
      cta: { label: "View booking", href: `https://app.getsweepr.com/bookings/${escHtml(data.bookingId)}` },
    }),
  };
}

export function cleanerNewJobEmail(data: {
  cleanerName: string;
  bookingId: string;
  scheduledAt: Date;
  pay: number;
  serviceType: string;
}): EmailContent {
  return {
    subject: `New job available — ${formatCurrency(data.pay)}`,
    html: layout({
      heading: `New ${escHtml(data.serviceType)} job, ${escHtml(data.cleanerName)}`,
      body: `
        <p>A new job is available in your area.</p>
        <p><strong>When:</strong> ${formatDateTime(data.scheduledAt.toISOString())}<br/>
        <strong>Estimated pay:</strong> ${formatCurrency(data.pay)}</p>
        <p>Accept it before it's gone.</p>`,
      cta: { label: "Review job", href: `https://clean.getsweepr.com/jobs/${escHtml(data.bookingId)}` },
    }),
  };
}

export function bookingCancelledEmail(data: {
  customerName: string;
  bookingId: string;
}): EmailContent {
  return {
    subject: "Your Sweepr booking was cancelled",
    html: layout({
      heading: `Booking cancelled`,
      body: `
        <p>Hi ${escHtml(data.customerName)}, your booking <code>${escHtml(data.bookingId)}</code> has been cancelled.</p>
        <p>If this was a mistake, you can rebook anytime — it only takes a minute.</p>`,
      cta: { label: "Book again", href: "https://app.getsweepr.com/book" },
    }),
  };
}

export function reviewRequestEmail(data: {
  customerName: string;
  bookingId: string;
  cleanerName: string;
}): EmailContent {
  return {
    subject: `How did ${data.cleanerName} do?`,
    html: layout({
      heading: `Rate your clean, ${escHtml(data.customerName)}`,
      body: `
        <p>${escHtml(data.cleanerName)} just finished your cleaning. We'd love your feedback!</p>
        <p>It takes 30 seconds and helps keep Sweepr's quality high.</p>`,
      cta: { label: "Leave a review", href: `https://app.getsweepr.com/bookings/${escHtml(data.bookingId)}` },
    }),
  };
}
