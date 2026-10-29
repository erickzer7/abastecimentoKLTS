# Painel de Rastreio KLT — PD10/PD11

PWA (Progressive Web App) para rastreio e validação do abastecimento de KLTs na linha de produção. Operadores usam o celular corporativo para escanear crachá, KLT vazia, endereço do pulmão e caixa de origem; cada ciclo é registrado no Supabase para o painel de gestão do líder.

## Stack

- **Vite + React + TypeScript** (SPA)
- **Supabase** (Postgres + Auth + Row Level Security)
- **html5-qrcode** (câmera do celular para QR e código de barras)
- **vite-plugin-pwa** (service worker, manifest, offline-first)
- **Cloudflare Pages** (hospedagem)

## 1. Rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Copiar o .env de exemplo e preencher
cp .env.example .env.local
# edite .env.local se necessário — já vem com os valores do projeto Supabase

# 3. Rodar o dev server
npm run dev
```

Abre em `http://localhost:5173`.

### Permissão da câmera

A API de câmera (`navigator.mediaDevices`) só funciona em contexto seguro — ou seja, `localhost` ou `https`. Em rede local sem HTTPS, o browser bloqueia o acesso. Para testar no celular na mesma rede:

```bash
# descubra seu IP local, ex: 192.168.1.10
npm run dev -- --host
# abra no celular: http://192.168.1.10:5173
```

Se o Chrome bloquear, use `chrome://flags/#unsafely-treat-insecure-origin-as-secure` adicionando o IP. Em produção isso não é problema porque Cloudflare Pages serve com HTTPS.

## 2. Publicar no GitHub

```bash
cd pwa-rastreio-klt

git init
git add .
git commit -m "feat: estrutura inicial do PWA de rastreio KLT"
git branch -M main

# Crie um repositório vazio no GitHub (pode ser privado)
# Ex: https://github.com/erick/rastreio-klt-pd10-pd11
git remote add origin https://github.com/<seu-usuario>/rastreio-klt-pd10-pd11.git
git push -u origin main
```

**Importante:** o arquivo `.env.local` está no `.gitignore` e NÃO vai pro repositório. As variáveis vão direto na configuração do Cloudflare Pages (próximo passo).

## 3. Deploy no Cloudflare Pages

No painel do Cloudflare:

1. **Workers & Pages → Create → Pages → Connect to Git**
2. Autoriza o repositório `rastreio-klt-pd10-pd11`
3. Configurações do build:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (vazio)
   - **Node version:** 20
4. **Environment variables** (seção *Settings → Environment variables*):
   - `VITE_SUPABASE_URL` = `https://usiskrjjqntkhjwiyzza.supabase.co`
   - `VITE_SUPABASE_KEY` = `sb_publishable_hueHKXAlALNhdempi0Tr9w_ossGDfhl`
5. **Save and Deploy**

## 4. Configurar domínio customizado

No projeto do Cloudflare Pages:

1. **Custom domains → Set up a custom domain**
2. Entra com `abastecimentoKLTS.caoamontadora.com.br`
3. O Cloudflare cria automaticamente o registro CNAME no DNS (se o domínio já está no Cloudflare).
4. Aguarda a propagação (geralmente < 1 min). HTTPS é automático.

## 5. SPA fallback para o React Router

Como o app usa `react-router-dom`, qualquer rota como `/panel` precisa cair no `index.html`. Cloudflare Pages já faz isso automaticamente para builds Vite, mas se der 404 em refresh, adicione um arquivo `public/_redirects`:

```
/*    /index.html   200
```

## Estrutura do projeto

```
pwa-rastreio-klt/
├── public/                    # assets estáticos (favicon, ícones PWA)
├── src/
│   ├── components/            # Scanner, Header
│   ├── hooks/                 # useAuth (contexto crachá → localStorage)
│   ├── lib/
│   │   ├── supabase.ts        # cliente Supabase
│   │   ├── parser.ts          # parser multi-formato (Chery novo/antigo, Changan)
│   │   ├── types.ts           # tipos TypeScript
│   │   └── db.ts              # queries e RPCs
│   ├── pages/
│   │   ├── Login.tsx          # scan do crachá
│   │   ├── OperatorApp.tsx    # fluxo multi-step
│   │   ├── Panel.tsx          # dashboard do líder
│   │   └── NotFound.tsx
│   ├── styles/index.css       # tema dark, componentes
│   ├── App.tsx                # rotas + Protected
│   ├── main.tsx               # entry
│   └── vite-env.d.ts
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Fluxo do operador (resumo)

1. **Login** — scan do QR do crachá → consulta `operadores` → salva em `localStorage`
2. **Idle** — tela de "aguardando KLT"
3. **Scan KLT** — câmera lê o `CODIGO` → `rpc buscar_peca_por_codigo` → retorna 1 linha com `variantes_count`
4. **Missão** — mostra foto, descrição, endereço, qtd (ou avisa que deve digitar manualmente)
5. **Scan endereço** — valida contra `endereco_busca`; grava no ciclo
6. **Scan caixa** — parser multi-formato detecta Chery v1/v2 ou Changan JSON; valida contra `codigo` esperado
7. **Confirmar** — fecha o ciclo; `qtd_digitada_manual = true` quando operador digitou (cadastro sem qty)

Qualquer passo com câmera tem fallback de digitação manual (botão "Digitar manualmente").

## Painel do líder

Rota `/panel` (visível apenas quando `operadores.lider = true`). Mostra:
- KPIs do dia (ciclos, taxa de acerto, tempo médio, operadores ativos)
- Ranking de produtividade por operador
- Tabela dos últimos 50 ciclos com status, qty, qty-manual-flag, duração

Atualiza automaticamente a cada 30 s. Usa as views `v_metricas_hoje`, `v_produtividade_operador`, `v_ciclos_recentes` já criadas no schema.

## Próximas iterações sugeridas

- Modo offline-first com fila de sincronização (service worker + IndexedDB)
- Export Excel do histórico de ciclos
- Visualização e resolução de divergências
- Visualização da tabela `v_pecas_pendentes` para corrigir cadastro
- Autenticação forte com Supabase Auth para líderes (mantendo crachá para operadores)
- Scanner de dedo Bluetooth (modo HID) — plug and play, sem alteração de código
