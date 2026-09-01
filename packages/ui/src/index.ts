/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// Primitives
export * from "./primitives/Button";
export * from "./primitives/Input";
export * from "./primitives/PhoneInput";
export * from "./lib/phone";
export * from "./primitives/Textarea";
export * from "./primitives/Select";
export * from "./primitives/Badge";
export * from "./primitives/Modal";
export * from "./primitives/Toast";
export * from "./primitives/Card";
export * from "./primitives/CountUp";
export * from "./primitives/Accordion";

// Layout
export * from "./layout/AppShell";
export * from "./layout/DashboardShell";
export * from "./layout/MarketingShell";
export * from "./layout/ThemeToggle";
export * from "./layout/ErrorBoundary";

// Booking
export * from "./booking/PriceSummary";
export * from "./booking/AddOnGrid";

// Cards / states
export * from "./cards/States";
export * from "./cards/StatCard";

// Assets
export * from "./assets/SweeprLogo";

// Components
export * from "./components/NavigationMap";
export * from "./components/MapboxMap";
export * from "./components/NotificationBell";
export * from "./components/SuccessCheck";
export * from "./components/SweeprLoader";
export * from "./components/SMSOptIn";
export * from "./components/WaitlistForm";
export * from "./components/NewsletterSubscribe";
export * from "./components/ReportProblem";
export * from "./components/AccountPrivacy";
export * from "./components/CookieConsent";
export * from "./components/FoundingMemberBadge";
export * from "./components/PromoWidget";
export * from "./components/PromoHost";

// Calendar
export { SweeprCalendar } from "./calendar/SweeprCalendar";
export { AddSlotModal } from "./calendar/AddSlotModal";
export { SlotChip } from "./calendar/SlotChip";
export type { CalendarSlot, CalendarProps, SlotType } from "./calendar/types";

// Hooks
export * from "./hooks/useReducedMotion";

// Lib
export { SafeText, sanitizeText } from "./lib/sanitize";
export { isValidEmail, validateEmail, validateText, validatePhone } from "./lib/validation";
export {
  mapboxgl,
  getMapboxToken,
  MAP_STYLE_LIGHT,
  MAP_STYLE_DARK,
  isDarkTheme,
  mapStyleForTheme,
  createMapboxMap,
  openInMapsUrl,
  bindMapTheme,
} from "./lib/mapbox";
export { initAnalytics, track, identify, resetAnalytics } from "./lib/analytics";
export { initSiteTracker, trackSiteEvent, type SiteApp } from "./lib/siteTracker";
export {
  initCookieEngine,
  enforceCookiePolicy,
  cookieInventory,
  classifyCookie,
  getCookieConsent,
  setAdvertisingConsent,
  setCookie,
  getCookie,
  deleteCookie,
  COOKIE_REGISTRY,
} from "./lib/cookieEngine";
export { Events } from "./lib/events";
