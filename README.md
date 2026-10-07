# Licitta Relatórios (queryx)

Microsserviço de BI do Licitta. Lê o Postgres da API principal e entrega:

- **Camada semântica:** o painel pede *o quê* (tema, medidas, "separar por",
  filtros e período) e o serviço monta um `SELECT` parametrizado, sempre
  restrito à empresa do usuário;
- **Relatórios prontos** (25, no código) e **relatórios da empresa**, criados
  no construtor guiado do painel sem rota nova nem deploy;
- **Painéis** com vários relatórios e um período comum;
- **Detalhamento:** clicar num número mostra os registros por trás dele;
- **Exportação** CSV (para o Excel em português) e XLSX;
- **Envio agendado por e-mail** (diário, semanal ou mensal), com o XLSX/CSV anexo.

A tela fica no painel web (`/admin/relatorios`). O serviço não tem domínio
público: o painel chama a API principal em `/bi/*`, e ela repassa para cá pela
rede privada, junto com o token da sessão.

```
Painel ──(cookie)──▶ API principal /bi/* ──(Bearer, rede privada)──▶ queryx /api/*
                                                                       │
                     GET /auth/me ◀── valida token e permissões ───────┤
                                                                       └──▶ Postgres (public: leitura; relatorios: escrita)
```

## Segurança

- **Empresa:** vem do `/auth/me` da API principal e é o primeiro predicado de
  toda consulta (`t.company_id = $1`). Nada no corpo da requisição a troca.
- **SQL:** os fragmentos SQL vêm só do catálogo (código). Valores do usuário são
  sempre parâmetros. Nomes de tema, campo e medida são validados e conferidos no
  catálogo antes de virar SQL.
- **Pool só de leitura** para o BI (`default_transaction_read_only`) e com
  `statement_timeout` (`QUERY_TIMEOUT_MS`). As escritas do serviço usam outro
  pool, só no schema `relatorios`.
- **Permissões:** `report:read` para ver e rodar relatórios e `report:manage`
  para criar, editar e excluir relatórios, painéis e agendamentos. Cada tema
  também exige a permissão do módulo dele (`service-order:read`,
  `timeclock:read`, `absence:read`, `user:read`, `audit:read`,
  `contract:read`, `licit:read`, `pops:read`). Quem não a tem não vê o tema, os
  relatórios dele nem os itens de painel dele.
- **Envios agendados** rodam com as permissões **atuais** do dono (quem criou ou
  editou por último). Cada destinatário só recebe se estiver ativo na empresa e
  puder ver relatórios e os temas do conteúdo. Vai um e-mail por pessoa, então
  ninguém vê o endereço dos outros.

## Temas (catálogo)

| Tema | Uma linha é | Destaques |
|---|---|---|
| `service_orders` | uma OS | situação, prazo (no prazo, atrasada, concluída com atraso), conclusão, tempo até concluir, por time |
| `assignments` | uma OS enviada a uma pessoa | aceite, recusa e motivo, tempo de resposta, direto ou pelo time |
| `executions` | uma execução enviada | aprovação de primeira, ajustes, tempo até avaliar, fotos |
| `fence_events` | uma saída ou retorno da cerca | saídas por pessoa e OS, distância, se o gestor viu |
| `pop_usage` | um POP numa OS | POPs mais usados e conclusão |
| `work_days` | um dia trabalhado | horas, média diária, horas acima da jornada, primeira entrada e última saída |
| `attendance` | um dia de escala | presença, falta, falta abonada, atraso (contra a escala e os abonos aprovados) |
| `absences` | um pedido de abono | aprovados, rejeitados, dias abonados, tempo de decisão |
| `people` | um usuário | perfil e status agora (disponível, ausente, offline) |
| `time_entries` | uma marcação | origem, ajustes e invalidações com autor e justificativa |
| `clock_attempts` | uma tentativa de ponto | recusas e motivo |
| `audit` | uma alteração | quem criou, alterou ou excluiu o quê |
| `access` | um evento de acesso | logins e falhas |
| `contracts` | um contrato | vigência, vencendo em 90 dias, valores |
| `licits` | uma licitação | modalidade, valor estimado e contratado |

Para **adicionar uma medida ou um campo**, edite o tema em
`src/analytics/domain/semantic/datasets/`. Ele aparece na hora no construtor.
O teste `test/datasets.spec.ts` roda **todas** as medidas e campos de todos os
temas num Postgres de verdade. SQL errado não passa no CI.

```typescript
reopened_count: { kind: "count", title: "Reabertas", format: "integer", filter: "t.status = 'REABERTA'" },
```

## API (`/api`, Bearer da API principal)

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/health` | pública |
| `GET` | `/me` | `report:read` |
| `GET` | `/analytics/catalog` | `report:read` |
| `POST` | `/analytics/query` · `/analytics/records` · `/analytics/values` · `/analytics/export` | `report:read` |
| `GET` | `/reports` · `/reports/:id` · `/reports/:id/export?format=xlsx\|csv&from&to` | `report:read` |
| `POST/PUT/DELETE` | `/reports[/:id]` | `report:manage` |
| `GET` | `/dashboards` · `/dashboards/:id` · `/dashboards/:id/export?from&to` | `report:read` |
| `POST/PUT/DELETE` | `/dashboards[/:id]` | `report:manage` |
| `GET/POST/PUT/DELETE` | `/schedules[/:id]`, `/schedules/recipients`, `POST /schedules/:id/run`, `GET /schedules/:id/runs` | `report:manage` |

Exemplo de consulta:

```json
POST /api/analytics/query
{
  "dataset": "attendance",
  "dimensions": ["person"],
  "measures": ["scheduled_days", "absent_days", "late_minutes", "attendance_rate"],
  "timeDimension": { "dimension": "day", "range": ["2026-09-01", "2026-09-30"] },
  "order": [["absent_days", "desc"]]
}
```

Datas são `AAAA-MM-DD`, dias no fuso `REPORTS_TIMEZONE`, com o fim inclusivo.

## Subindo no Railway

1. Crie um serviço apontando para este repositório. O `railway.json` usa o
   `Dockerfile`, roda `node dist/migrate-cli.js` no pre-deploy (cria o schema
   `relatorios`) e usa o healthcheck `/api/health`.
2. Variáveis (veja `.env.example`): `DATABASE_URL` (o mesmo banco da API),
   `MAIN_API_URL` (rede privada) e, para e-mail, `MAIL_PROVIDER`, `MAIL_FROM` e
   `SMTP_URL` ou `RESEND_API_KEY`. O Railway pode bloquear SMTP em alguns
   planos. Nesse caso use `resend`.
3. **Não gere domínio público.** Na API principal, configure
   `REPORTS_SERVICE_URL=http://<este-servico>.railway.internal:<PORT>`.

## Desenvolvimento

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:3000/api
npm test               # 77 testes (PGlite com o schema real da API)
npm run build
```

Os testes sobem um Postgres em memória com as migrations da API principal
copiadas em `test/fixtures/backend-schema`. Quando a API ganhar migration que
mexa em tabela usada aqui, rode `npm run sync:backend-schema`.

`legacy/` guarda a versão antiga (MongoDB + front próprio), só como referência.
Pode ser apagada.
