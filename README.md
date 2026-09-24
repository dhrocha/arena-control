# Arena Control

Sistema local/offline de controle de partidas de futebol/futsal com modos **Pelada** e **Game Day**.

## Requisitos

- Node.js 20+
- Rede local (Wi-Fi / hotspot) — internet não é necessária na operação

## Instalação

```bash
npm install
npm run dev
```

O servidor escuta em `0.0.0.0:3000` e imprime os IPs locais no terminal.

## Rotas

| Rota | Uso |
|------|-----|
| `/` | Dashboard |
| `/admin` | Central de Comando (notebook) |
| `/control` | Controle mobile (PIN padrão: `1234`) |
| `/arena` | Tela da TV / projetor |
| `/setup` | Diagnóstico e QR |
| `/settings` | Configurações e backup |
| `/effects` | Editor de efeitos |

## Fluxo rápido

1. `npm run dev` no notebook
2. Abrir `/arena` na TV
3. Escanear o QR em `/admin` ou `/setup` no celular
4. Autenticar com o PIN
5. Cadastrar times/jogadores e criar partida Game Day
6. Operar gols, efeitos, MVP e final

## Produção

```bash
npm run build
npm start
```

Assets de áudio em `public/audio/` podem ser substituídos mantendo os mesmos nomes.
