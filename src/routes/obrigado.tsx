import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/obrigado")({
  head: () => ({
    meta: [
      { title: "Obrigado!" },
      { name: "description", content: "Sua ativação foi concluída com sucesso." },
      { property: "og:title", content: "Obrigado!" },
      { property: "og:description", content: "Sua ativação foi concluída com sucesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObrigadoPage,
});

function ObrigadoPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center px-4">
      <section className="max-w-[520px] w-full text-center bg-white rounded-[14px] shadow-sm p-10">
        <div className="text-[48px]">🎉</div>
        <h1 className="text-[#475569] text-[26px] font-extrabold mt-4">Tudo certo!</h1>
        <p className="text-[#64748b] text-[16px] leading-relaxed mt-3">
          Sua ativação foi concluída com sucesso. Você já pode aproveitar todos os recursos da
          versão 2.0.
        </p>
      </section>
    </main>
  );
}
