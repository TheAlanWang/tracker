// Google Analytics 4 (gtag.js), production builds only.
//
// Page views are sent manually from <GaPageViews /> with a sanitized path:
// raw URLs carry workspace slugs, task identifiers and auth codes/tokens
// (`/auth/callback?code=…`, `/reset-password#access_token=…`), none of which
// should reach Google. That's also why the GA stream's Enhanced measurement
// "page changes based on browser history events" should stay OFF — it would
// report the raw URL on every SPA navigation.

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as
  | string
  | undefined;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const gaEnabled = import.meta.env.PROD && !!MEASUREMENT_ID;

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the `arguments` object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
}

// Collapse dynamic route segments into placeholders so reports group by page
// type and carry no user data. Mirrors the routes in App.tsx.
export function sanitizePath(pathname: string): string {
  return pathname
    .replace(/^\/(browse|t)\/[^/]+/, "/$1/:task")
    .replace(/^\/w\/[^/]+/, "/w/:ws")
    .replace(/\/p\/[^/]+/, "/p/:project")
    .replace(/\/tasks\/[^/]+/, "/tasks/:task")
    .replace(/\/sprints\/[^/]+/, "/sprints/:sprint");
}

export function trackPageView(pathname: string) {
  if (!gaEnabled) return;
  init();
  const path = sanitizePath(pathname);
  window.gtag("event", "page_view", {
    page_location: window.location.origin + path,
    page_path: path,
    // document.title can hold task/project names, so report the path instead.
    page_title: path,
  });
}
