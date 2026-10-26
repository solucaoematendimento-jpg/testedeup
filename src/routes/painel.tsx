import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getFunnelEvents } from "@/lib/funnel.functions";
import { isInternalTraffic, setInternalTraffic } from "@/lib/track";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Tracker — upsell one-click" },
      { name: "description", content: "Métricas principais do funil de reverificação." },
      { property: "og:title", content: "Tracker — upsell one-click" },
      { property: "og:description", content: "Métricas principais do funil de reverificação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
  errorComponent: () => (
    <div className="p-6 text-[14px] text-slate-300">Não foi possível carregar o tracker agora. Tente recarregar.</div>
  ),
});

type EventRow = { event: string; session_id: string; created_at: string };

const pct = (n: number, total: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");

const EVENT_LABEL: Record<string, string> = {
  page_view: "Visita na página",
  verify_click: "Clique em reverificar",
  progress_complete: "Progresso 100%",
  widget_script_loaded: "Script do upsell carregado",
  widget_script_error: "Erro ao carregar script do upsell",
  upsell_iframe_visible: "Oferta exibida",
  upsell_interaction: "Interação na oferta",
  popup_shown: "Popup exibido",
  wallet_click: "Clique no wallet",
};

function Kpi({ label, value, sub, accent = "slate" }: { label: string; value: string; sub?: string; accent?: "green" | "red" | "blue" | "slate" }) {
  const accentClasses = {
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    red: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    blue: "border-sky-500/20 bg-sky-500/10 text-sky-400",
    slate: "border-slate-700/40 bg-[#151f2b] text-slate-100",
  };

  return (
    <div className={`rounded-2xl border p-5 ${accentClasses[accent]}`}>
      <p className="text-[13px] font-medium text-slate-400">{label}</p>
      <p className="mt-2 text-[42px] font-bold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-slate-500">{sub}</p>}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const PERIODS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "Tudo", hours: 0 },
] as const;

function Painel() {
  const [internal, setInternal] = useState(false);
  const [manualRefreshAt, setManualRefreshAt] = useState<number | null>(null);
  const [hours, setHours] = useState<number>(24);

  // Quem abre o painel é você: marca esse navegador como interno para não poluir os dados.
  useEffect(() => {
    setInternalTraffic(true);
    setInternal(isInternalTraffic());
  }, []);

  const fetchEvents = useServerFn(getFunnelEvents);
  const { data, dataUpdatedAt, isFetching, refetch } = useQuery({
    queryKey: ["funnel-events", hours],
    refetchInterval: 3000,
    refetchIntervalInBackground: true,

    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchEvents({ data: { hours } }) as Promise<EventRow[]>,
  });

  const refreshNow = async () => {
    const result = await refetch({ cancelRefetch: true });
    if (!result.error) setManualRefreshAt(Date.now());
  };


  const rows = data ?? [];
  const sessionsOf = (ev: string) => new Set(rows.filter((r) => r.event === ev).map((r) => r.session_id));
  const uniq = (ev: string) => sessionsOf(ev).size;

  const visits = uniq("page_view");
  const clicks = uniq("verify_click");
  const upsell = uniq("upsell_iframe_visible");
  const interact = uniq("upsell_interaction");
  const wallet = uniq("wallet_click");
  const sales = uniq("upsell_accepted");

  // Falhas derivadas
  const clickSessions = sessionsOf("verify_click");
  const upsellSessions = sessionsOf("upsell_iframe_visible");
  const interactSessions = sessionsOf("upsell_interaction");
  const scriptErrors = uniq("widget_script_error");
  const clickedNoUpsell = [...clickSessions].filter((s) => !upsellSessions.has(s)).length;
  const upsellNoInteraction = [...upsellSessions].filter((s) => !interactSessions.has(s)).length;
  const visitNoClick = visits - clicks;

  const failures = [
    { label: "Erro ao carregar script do upsell", value: scriptErrors, hint: "script da oferta não carregou" },
    { label: "Clicou mas a oferta não apareceu", value: clickedNoUpsell, hint: "clique registrado sem iframe visível" },
    { label: "Viu a oferta e não interagiu", value: upsellNoInteraction, hint: "abandono dentro da oferta" },
    { label: "Visitou e não clicou", value: visitNoClick > 0 ? visitNoClick : 0, hint: "não iniciou a reverificação" },
  ];

  const logs = rows.slice(0, 40);

  return (
    <main className="min-h-screen bg-[#0d141d] font-app antialiased">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight text-slate-100">Tracker do funil</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {isFetching
                ? "Atualizando…"
                : `${manualRefreshAt ? "Atualização manual concluída" : `Atualizado ${dataUpdatedAt ? timeAgo(new Date(dataUpdatedAt).toISOString()) : "agora"}`} · tempo real (3s)`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setHours(p.hours)}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                    hours === p.hours
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                      : "border-slate-700/50 bg-[#151f2b] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshNow()}
            disabled={isFetching}
            className="mr-2 rounded-lg border border-slate-700/50 bg-[#151f2b] px-4 py-2 text-[13px] text-slate-300 transition-colors hover:text-slate-100 disabled:cursor-wait disabled:opacity-60"
          >
            {isFetching ? "Atualizando…" : "Atualizar agora"}
          </button>
          <button
            type="button"
            onClick={() => {
              setInternalTraffic(!internal);
              setInternal(!internal);
            }}
            className={`rounded-lg border px-4 py-2 text-[13px] transition-colors ${
              internal
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-slate-700/50 bg-[#151f2b] text-slate-400"
            }`}
          >
            {internal ? "Meu acesso não é contado" : "Contar meu acesso"}
          </button>
        </div>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Visitas" value={String(visits)} sub="sessões únicas na página" />
          <Kpi label="Cliques em reverificar" value={String(clicks)} sub={`${pct(clicks, visits)}% das visitas`} accent="blue" />
          <Kpi label="Upsell exibido" value={String(upsell)} sub={`${pct(upsell, visits)}% das visitas`} accent="blue" />
          <Kpi label="Interações no upsell" value={String(interact)} sub={`${pct(interact, upsell)}% de quem viu`} accent="blue" />
          <Kpi label="Vendas do upsell" value={String(sales)} sub={`${pct(sales, visits)}% das visitas · ${pct(sales, interact)}% de quem interagiu`} accent="green" />
          <Kpi label="Cliques no wallet" value={String(wallet)} sub={`${pct(wallet, visits)}% das visitas`} accent="slate" />
        </section>

        <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700/40 bg-[#151f2b] p-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <h2 className="text-[15px] font-semibold text-slate-100">Logs em tempo real</h2>
            </div>
            <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {logs.length === 0 && <li className="text-[13px] text-slate-500">Nenhum evento ainda.</li>}
              {logs.map((r, i) => (
                <li
                  key={`${r.session_id}-${r.created_at}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/30 bg-[#0f1822] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-medium ${r.event === "widget_script_error" ? "text-rose-400" : "text-slate-200"}`}>
                      {EVENT_LABEL[r.event] ?? r.event}
                    </p>
                    <p className="truncate text-[11px] text-slate-600">sessão {r.session_id.slice(0, 8)}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-700/40 bg-[#151f2b] p-5">
            <h2 className="text-[15px] font-semibold text-slate-100">Falhas possíveis</h2>
            <p className="mt-1 text-[12px] text-slate-500">Pontos onde o lead pode ter travado no fluxo</p>
            <ul className="mt-4 space-y-3">
              {failures.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/30 bg-[#0f1822] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-200">{f.label}</p>
                    <p className="text-[11px] text-slate-600">{f.hint}</p>
                  </div>
                  <span className={`text-[22px] font-bold ${f.value > 0 ? "text-rose-400" : "text-slate-600"}`}>{f.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p className="mt-8 text-[12px] text-slate-600">
          Faturamento e vendas confirmadas do upsell ficam na plataforma de pagamento.
        </p>
      </div>
    </main>
  );
}
