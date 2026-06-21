// Typed event catalog — all analytics events in one place
export const Events = {
  // Booking funnel
  BOOKING_STARTED: 'booking_started',
  BOOKING_STEP_COMPLETED: 'booking_step_completed',
  BOOKING_QUOTE_VIEWED: 'booking_quote_viewed',
  BOOKING_PAYMENT_STARTED: 'booking_payment_started',
  BOOKING_COMPLETED: 'booking_confirmed',
  BOOKING_ABANDONED: 'booking_abandoned',

  // Subscription
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',

  // Cleaner
  CLEANER_ONBOARDING_STARTED: 'cleaner_onboarding_started',
  CLEANER_ONBOARDING_STEP: 'cleaner_onboarding_step',
  CLEANER_APPLICATION_SUBMITTED: 'cleaner_application_submitted',
  CLEANER_JOB_ACCEPTED: 'cleaner_job_accepted',
  CLEANER_JOB_DECLINED: 'cleaner_job_declined',

  // Auth
  SIGNED_UP: 'signed_up',
  SIGNED_IN: 'signed_in',
  SIGNED_OUT: 'signed_out',
} as const
