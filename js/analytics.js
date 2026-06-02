import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "./config.js";

let analyticsBootstrapped = false;

export function initGoogleAnalytics() {
  const id = String(GOOGLE_ANALYTICS_MEASUREMENT_ID || "").trim();
  if (!id || analyticsBootstrapped || typeof document === "undefined") return;
  analyticsBootstrapped = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
}
