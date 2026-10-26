# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Como rodar este projeto localmente

```sh
cd reverifypay-tiktok
bun install        # ou: npm install
bun run dev        # abre em http://localhost:8080
```

O arquivo `.env` já traz a URL e a chave pública do backend (Lovable Cloud).
Para apontar para outro backend, troque os valores de `VITE_SUPABASE_*` e
`SUPABASE_*` nesse arquivo.

## O que está incluído

- `src/routes/index.tsx` — página de reverificação com o upsell one-click (Vendepay),
  modal de conclusão e redirecionamento para a wallet.
- `src/routes/painel.tsx` — painel de métricas em tempo real.
- `src/routes/obrigado.tsx` — página de agradecimento.
- `src/lib/track.ts` e `src/lib/funnel.functions.ts` — captura e leitura dos eventos do funil.
- `supabase/migrations/` — tabelas e permissões do banco (`funnel_events`, `funnel_events_archive`).
- `src/assets/tiktok-logo.png` — a logo em arquivo real (neste pacote ela é importada
  direto, sem depender do armazenamento do Lovable).

## Observações

- As métricas ficam no banco do projeto atual. Se você clonar/replicar o app,
  cada versão tem seu próprio banco e seus próprios números.
- O upsell só carrega a oferta quando a página recebe `?vendaId=<id real>`
  (a Vendepay envia esse parâmetro automaticamente).
