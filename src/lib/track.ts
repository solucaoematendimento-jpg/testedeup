import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "funnel_session_id";
const INTERNAL_KEY = "funnel_internal";

export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** Marca (ou desmarca) este navegador como tráfego interno — não entra nas métricas. */
export function setInternalTraffic(on: boolean): void {
  try {
    if (on) localStorage.setItem(INTERNAL_KEY, "1");
    else localStorage.removeItem(INTERNAL_KEY);
  } catch {
    /* ignora */
  }
}

export function isInternalTraffic(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("internal");
    if (flag === "1" || flag === "true") setInternalTraffic(true);
    if (flag === "0" || flag === "false") setInternalTraffic(false);
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

export type FunnelEvent =
  | "page_view"
  | "verify_click"
  | "progress_complete"
  | "widget_script_loaded"
  | "widget_script_error"
  | "upsell_iframe_visible"
  | "upsell_interaction"
  | "upsell_message"
  | "upsell_accepted"
  | "upsell_height"
  | "upsell_resize"
  | "session_summary"
  | "popup_shown"
  | "wallet_click";

/** Eventos que só fazem sentido uma vez por sessão — repetições são ruído. */
const ONCE_PER_SESSION: ReadonlySet<FunnelEvent> = new Set<FunnelEvent>([
  "page_view",
  "verify_click",
  "progress_complete",
  "widget_script_loaded",
  "widget_script_error",
  "upsell_iframe_visible",
  "upsell_interaction",
  "upsell_accepted",
  "popup_shown",
  "wallet_click",
  "session_summary",
]);

const sent = new Set<string>();

function alreadySent(event: FunnelEvent): boolean {
  const key = `funnel_sent_${event}`;
  if (sent.has(event)) return true;
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignora */
  }
  sent.add(event);
  return false;
}

/** Eventos críticos: enviados com keepalive, para sobreviver ao fechamento da página. */
const CRITICAL: ReadonlySet<FunnelEvent> = new Set<FunnelEvent>([
  "upsell_accepted",
  "session_summary",
]);

function sendKeepalive(payload: { session_id: string; event: string; details: unknown }): boolean {
  try {
    const url = import.meta.env['VITE_SUPABASE_URL'];
    const key =
      import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ??
      import.meta.env['VITE_SUPABASE_ANON_KEY'];
    if (!url || !key) return false;
    void fetch(`${url}/rest/v1/funnel_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: key as string,
        Authorization: `Bearer ${key as string}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registro de evento totalmente "fire and forget".
 * Nunca lança, nunca bloqueia — o fluxo do upsell one-click não depende disso.
 */
export function track(event: FunnelEvent, details: Record<string, unknown> = {}): void {
  try {
    if (isInternalTraffic()) return;
    if (ONCE_PER_SESSION.has(event) && alreadySent(event)) return;
    const payload = { session_id: getSessionId(), event, details };
    if (CRITICAL.has(event) && sendKeepalive(payload)) return;
    void supabase
      .from("funnel_events")
      .insert(payload as never)
      .then(() => undefined, () => undefined);
  } catch {
    /* ignora */
  }
}

