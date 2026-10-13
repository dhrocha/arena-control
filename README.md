# Arena Control

Sistema local/offline de controle de partidas de futebol/vôlei com modos **Game Day** e **Pelada** (agenda por horário).

## Requisitos

- Node.js 20+
- Rede local (Wi-Fi / hotspot) — internet não é necessária na operação

## Instalação

```bash
cp .env.example .env   # opcional — telefone "Anuncie aqui"
npm install
npm run dev
```

O servidor escuta em `0.0.0.0:3000` e imprime os IPs locais no terminal.

### Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `PORT` | Porta HTTP (padrão: settings / 3000) |
| `ARENA_ADVERTISE_PHONE` | Telefone na tira "Anuncie aqui" do placar da pelada |

## Rotas

| Rota | Uso |
|------|-----|
| `/` | Dashboard |
| `/admin` | Central de Comando (notebook) |
| `/control` | Controle mobile Game Day (PIN padrão: `1234`) |
| `/pelada` | Controle da pelada (mesmo PIN) |
| `/arena` | Tela da TV / projetor |
| `/setup` | Diagnóstico e QR |
| `/settings` | Configurações e backup |
| `/effects` | Editor de efeitos |
| `/sponsors` | Patrocinadores |

## Fluxo Game Day

1. `npm run dev` no notebook
2. Abrir `/arena` na TV
3. Em `/admin` ou `/control`, cadastrar times e criar partida
4. Operar gols/pontos, efeitos, MVP e final

## Fluxo Pelada

1. Em `/admin` → aba **Peladas**, cadastrar horário (nome, telefone, data, hora, duração, esporte)
2. No horário, abrir o detalhe e clicar **Iniciar pelada**
3. Em `/pelada` (PIN), configurar tempo do jogo e cores dos times
4. Controlar: Iniciar / Pausar / Finalizar e placar (+/−)
5. Ao acabar o tempo geral da sessão, `/pelada` fica indisponível até o admin iniciar outra

Durante o jogo da pelada, a arena mostra anúncios a cada 60s (10s). Em pausa ou entre jogos, exibe o patrocinador master. Game Day **não** usa o overlay periódico — só idle, MVP, timeout, intervalo, etc.

## Produção

```bash
npm run build
npm start
```

Assets de áudio em `public/audio/` podem ser substituídos mantendo os mesmos nomes.
