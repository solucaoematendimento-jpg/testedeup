import { createServerFn } from "@tanstack/react-start";

// POST evita qualquer cache de resposta GET no navegador/CDN — o painel precisa
// sempre dos números mais recentes.
export const getFunnelEvents = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const hours = Number((data as { hours?: unknown } | undefined)?.hours ?? 0);
    return { hours: Number.isFinite(hours) && hours > 0 ? hours : 0 };
  })
  .handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Janela de tempo: 0 = todo o histórico.
  const since =
    data.hours > 0 ? new Date(Date.now() - data.hours * 3600_000).toISOString() : null;

  /** Eventos de diagnóstico geram muitas linhas por sessão e não devem competir
   * com os eventos de funil dentro do limite da consulta. */
  const funnelEvents = [
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
  ];

  // 1) Busca cada etapa separadamente. A API limita cada resposta a 1.000
  // linhas; misturar todas as etapas fazia os eventos de venda mais antigos
  // desaparecerem da resposta quando o total combinado passava desse limite.
  type Row = { event: string; session_id: string; created_at: string };
  const eventResults = await Promise.all(
    funnelEvents.map((event) => {
      let q = supabaseAdmin
        .from("funnel_events")
        .select("event, session_id, created_at")
        .eq("event", event);
      if (since) q = q.gte("created_at", since);
      return q.order("created_at", { ascending: false }).limit(1000);
    }),
  );

  const failedResult = eventResults.find((result) => result.error);
  if (failedResult?.error) throw failedResult.error;
  const funnelRows = eventResults.flatMap((result) => (result.data ?? []) as Row[]);

  // 2) Últimos eventos de qualquer tipo — alimenta o log em tempo real
  let recentQuery = supabaseAdmin.from("funnel_events").select("event, session_id, created_at");
  if (since) recentQuery = recentQuery.gte("created_at", since);
  const recent = await recentQuery.order("created_at", { ascending: false }).limit(120);
  if (recent.error) throw recent.error;

  const rows = [...funnelRows, ...((recent.data ?? []) as Row[])];

  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.session_id}|${r.event}|${r.created_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

