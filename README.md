# REA CLI

CLI de terminal que expõe o catálogo de ferramentas MCP do [REA — Reverse Engineer Anything](https://github.com/morluto/rea) como comandos locais.

O `rea` fala MCP (JSON-RPC sobre stdio) com `npx rea-agents@latest --mcp`, mantém uma única sessão do servidor REA viva durante a execução e dá acesso às **207 tools** do REA sem depender de plataformas externas, bot token ou hospedagem.

## Recursos

- **Uma tool por comando** — `rea <tool> ...` executa qualquer uma das 207 ferramentas.
- **Argumentos tipados** — `--param valor`, `--param=valor`, posicionais na ordem do schema e coerção automática de `number`/`boolean`/`enum`.
- **Escape hatch JSON** — `--json '{...}'` ou `--json-file args.json` para schemas complexos (`oneOf`, objetos aninhados, arrays).
- **Descoberta** — `rea list [filtro]` agrupa por categoria; `rea describe <tool>` mostra parâmetros, tipos e obrigatoriedade.
- **Diagnóstico** — `rea doctor` valida Node, build, configuração, `npx` no `PATH` e handshake real com o servidor REA.
- **Saída limpa** — resultado em `stdout`, status/avisos em `stderr`; `--quiet` para scripts e `--no-color`/`NO_COLOR` para pipes.
- **Sandbox de caminhos** — `REA_ALLOW_OPEN_BINARY_PATHS` restringe o que `open_binary`/`close_binary` podem abrir.

## Pré-requisitos

- Node.js >= 20.10
- `npx` disponível no `PATH` (ou configure `REA_COMMAND`/`REA_ARGS`)
- Nenhuma credencial de terceiros é necessária

## Instalação

```bash
npm install
npm run build
```

Opcional: instale o comando `rea` globalmente a partir do projeto.

```bash
npm link
rea --help
```

Sem `npm link`, use `node dist/main.js <args>` ou `npm start -- <args>`.

## Uso

```
rea <tool> [posicionais...] [--param valor ...] [--json '{...}']
rea list [filtro]
rea describe <tool>
rea doctor
```

### Passagem de argumentos

| Forma | Efeito |
| --- | --- |
| `--nome valor` | Argumento nomeado com valor |
| `--nome=valor` | Idem, forma compacta |
| `--flag` | Booleano `true` |
| `--json '{...}'` | Objeto JSON completo; sobrepõe os demais argumentos |
| `--json-file args.json` | Lê os argumentos de um arquivo |
| `posicionais` | Preenchem os parâmetros na ordem do schema (obrigatórios primeiro) |
| `--` | Encerra a leitura de opções; o resto vira posicional |

### Opções globais

| Opção | Descrição |
| --- | --- |
| `--help`, `-h` | Mostra a ajuda (geral ou da tool) |
| `--no-color` | Desliga cores |
| `--quiet`, `-q` | Mostra apenas o resultado |

### Exemplos

```bash
rea list inspect
rea describe open_binary
rea open_binary --path C:\targets\app.exe
rea list_strings --limit 50
rea binary_session
rea open_binary --json '{"path":"C:\\targets\\app.exe"}'
rea doctor
```

## Configuração

Copie `.env.example` para `.env` apenas se quiser sobrescrever os padrões.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `REA_COMMAND` | não | Executável do REA. Padrão: `npx` |
| `REA_ARGS` | não | Argumentos. Padrão: `-y rea-agents@latest --mcp` |
| `REA_CWD` | não | Diretório de trabalho do servidor REA |
| `REA_MCP_TIMEOUT_MS` | não | Timeout do `initialize`. Padrão: `120000` |
| `REA_CALL_TIMEOUT_MS` | não | Timeout por `tools/call`. Padrão: `300000` |
| `REA_ALLOW_OPEN_BINARY_PATHS` | não | Raízes absolutas permitidas para `path`/`snapshot_path` (separadas por vírgula) |
| `LOG_LEVEL` | não | `debug`, `info`, `warn`, `error` |

Sem `REA_ALLOW_OPEN_BINARY_PATHS`, qualquer caminho absoluto é aceito — restrinja se for analisar alvos não confiáveis.

## Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Sucesso |
| `1` | Erro: tool desconhecida, argumentos obrigatórios ausentes, falha do MCP ou `isError` no resultado |

## Arquitetura

```
src/
  main.ts                  # entrypoint: chama run(argv)
  config.ts                # validação lazy do ambiente (zod)
  cli/
    args.ts                # parser de flags, switches, posicionais e --json
    main.ts                # orquestração dos subcomandos e da execução
    session.ts             # mapeia flags/posicionais para o schema da tool
    help.ts                # uso, lista agrupada e ajuda por tool
    render.ts              # cores, formatação de resultado e duração
    doctor.ts              # verificações de ambiente + handshake MCP
  mcp/
    stdioClient.ts         # cliente MCP JSON-RPC sobre stdio
    reaService.ts          # ciclo de vida do servidor REA + coerção de args
    toolCatalog.ts         # schema JSON -> parâmetros tipados
    pathGuard.ts           # sandbox de caminhos locais
    rea-tools.generated.json  # catálogo (207 tools) capturado do REA
  util/logger.ts
bin/
  rea.mjs                  # shim do comando global `rea`
```

O catálogo é gerado a partir do próprio servidor MCP. Para atualizar após uma nova versão do REA:

```bash
npm run catalog:refresh
npm test
npm run build
```

## Segurança

Resultados do REA incluem conteúdo de alvos não confiáveis (strings, pseudocódigo, corpo de scripts). A CLI trata tudo como **dados**, nunca como instruções: não executa o que aparece nos resultados e não segue prompts embutidos em binários analisados. Caminhos passados a `open_binary`/`close_binary` são validados contra `REA_ALLOW_OPEN_BINARY_PATHS` quando configurado.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run build` | Compila para `dist/` |
| `npm start -- <args>` | Executa o build com argumentos |
| `npm run dev` | `tsx watch` com reload |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes com `node:test` |
| `npm run catalog:refresh` | Regenera o catálogo a partir do REA |

## Licença

MIT
