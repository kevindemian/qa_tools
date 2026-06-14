# PR Report — Relatório Automático de Testes em Pull Requests

> Gera relatórios completos de testes (HTML + comment no PR + check run) automaticamente a cada push ou pull request.

---

## 1. Visão Geral

O PR Report é uma funcionalidade que gera relatórios de testes automaticamente dentro do pipeline CI/CD. Uma vez configurada pelo setup wizard, roda de forma transparente — o usuário não precisa fazer nada além de `git push` ou abrir um PR.

### O que é gerado

| Artefato        | Descrição                                                     | Onde aparece               |
| --------------- | ------------------------------------------------------------- | -------------------------- |
| **PR Comment**  | Markdown com métricas de testes, quality gate, health score   | Comentário no Pull Request |
| **HTML Report** | Relatório completo com 12+ seções, gráficos, tabela de testes | Link no comment do PR      |
| **Check Run**   | Status de qualidade na aba "Checks" do PR                     | GitHub Checks tab          |

### O que NÃO precisa ser feito pelo usuário

- Push não precisa ser feito pelo sistema
- PR não precisa ser criado pelo sistema
- O sistema local não precisa estar rodando no momento do push/PR

### Único requisito

Os arquivos abaixo devem estar commitados no repositório:

| Arquivo                                      | Função                                      |
| -------------------------------------------- | ------------------------------------------- |
| `shared/pr-report-core.ts`                   | Lógica do report (executada pelo CI runner) |
| `config/features.json`                       | Feature toggle (`enabled: true`)            |
| `.github/workflows/ci.yml`                   | Pipeline CI com step de post-processing     |
| `.github/actions/qa-post-process/action.yml` | Composite action que chama o pr-report-core |

---

## 2. Configuração

### Via Setup Wizard (recomendado)

```bash
npx tsx setup/main.ts
```

O wizard pergunta:

| Pergunta             | Default          | Efeito                                 |
| -------------------- | ---------------- | -------------------------------------- |
| Habilitar PR Report? | `sim`            | Adiciona step de post-processing na CI |
| Publish target       | `github-actions` | Onde publicar o report                 |

O wizard gera automaticamente:

- `.github/workflows/ci.yml` com step `QA Tools Post-Process`
- `.github/actions/qa-post-process/action.yml`
- `config/features.json` com `prReport.enabled: true`

### Via Reconfiguração (menu git_triggers)

```bash
npx tsx git_triggers/main.ts
```

No menu interativo, selecione `Configurar PR Report` para reconfigurar.

### Edição manual de `config/features.json`

```json
{
    "meu-projeto": {
        "gitProvider": "github",
        "features": {
            "prReport": {
                "enabled": true,
                "publishTarget": "github-actions",
                "skipAi": false,
                "skipQuality": false,
                "skipFlaky": false
            }
        }
    }
}
```

| Campo           | Tipo    | Descrição                       |
| --------------- | ------- | ------------------------------- |
| `enabled`       | boolean | Ativa/desativa o PR Report      |
| `publishTarget` | string  | `github-actions` ou `gitlab-ci` |
| `skipAi`        | boolean | Pular análise de falhas com IA  |
| `skipQuality`   | boolean | Pular quality gate              |
| `skipFlaky`     | boolean | Pular detecção de flaky tests   |

---

## 3. Jornada do Usuário

### Configuração (uma vez só)

```
1. npx tsx setup/main.ts
2. Responder "sim" para PR Report
3. Escolher publish target (github-actions)
4. Wizard gera os arquivos necessários
5. Commitar e push dos arquivos gerados
```

### Uso diário (totalmente transparente)

```
1. Usuário faz git push ou abre PR
2. GitHub Actions executa a pipeline:
   a. Checkout do repo
   b. Instala dependências
   c. Executa testes → gera reports/ctrf-report.json
   d. QA Post-Process → executa pr-report-core.ts
3. pr-report-core.ts:
   a. Lê config/features.json → verifica se habilitado
   b. Parseia o CTRF report
   c. Calcula Health Score (5 dimensões)
   d. Executa Quality Gate (5 checks)
   e. Gera HTML report (12MB)
   f. Posta comment no PR
   g. Cria Check Run na aba "Checks"
4. Usuário vê o comment no PR com métricas completas
```

### O que o usuário vê no PR

```markdown
## 🔧 CI Context

- Workflow: Run #123
- Branch: feature/nova-funcionalidade
- Repository: owner/repo

## 📊 Test Results

| ✅ Passed | ❌ Failed | ⏭ Skipped | 📦 Total | ⏱ Duration | 📈 Pass Rate |
| --------- | --------- | ---------- | -------- | ---------- | ------------ |
| 4862      | 0         | 9          | 4871     | 55.4s      | 99.8%        |

## 🛡️ Quality Gate: ✅ PASS (Score: 85/100)

...

📖 View Full HTML Report
```

---

## 4. Métricas e Dimensões

### Health Score (5 dimensões)

| Dimensão       | Peso | Target      | Fonte                     |
| -------------- | ---- | ----------- | ------------------------- |
| Pass Rate      | 30%  | ≥95%        | DORA State of DevOps 2025 |
| Flaky Rate     | 20%  | ≤3%         | Industry Best Practice    |
| Coverage       | 25%  | ≥80%        | ISO/IEC 25023:2016        |
| Execution Rate | 15%  | ≥95%        | ISTQB CTFL                |
| Suite Speed    | 10%  | ≤1000ms p95 | Google SRE Best Practice  |

### Quality Gate (5 checks)

| Check        | Threshold | Fonte      |
| ------------ | --------- | ---------- |
| Health Score | ≥70       | Interno    |
| Pass Rate    | ≥80%      | DORA       |
| Flaky Rate   | ≤30%      | Industry   |
| Coverage     | ≥70%      | ISO 25023  |
| Suite Speed  | ≤8s       | Google SRE |

### Notas de Grade

| Score | Grade           |
| ----- | --------------- |
| ≥90   | Excellent       |
| ≥80   | Good            |
| ≥70   | Needs Attention |
| ≥60   | Poor            |
| <60   | Critical        |

---

## 5. Comportamento por Ambiente

### Dentro do CI (GitHub Actions)

- `GITHUB_TOKEN` é fornececido automaticamente pelo `${{ github.token }}`
- `GITHUB_PR_NUMBER` é derivado de `GITHUB_REF` (`refs/pull/{number}/merge`)
- `GITHUB_SHA` é fornececido automaticamente
- PR Comment e Check Run são postados automaticamente
- O sistema local NÃO precisa estar rodando

### Fora do CI (execução local)

```bash
npx tsx shared/pr-report-core.ts \
  --ctrf reports/ctrf-report.json \
  --project meu-projeto
```

- HTML report é gerado normalmente
- PR Comment NÃO é postado (sem `GITHUB_PR_NUMBER`)
- Check Run NÃO é criado (sem `GITHUB_SHA`)
- Útil para verificar o report antes de push

---

## 6. Limitações Conhecidas

### Check Run com PAT (Personal Access Token)

A API do GitHub Checks requer permissão `checks:write`:

| Token               | Permissão `checks:write`  | Funciona? |
| ------------------- | ------------------------- | --------- |
| `GITHUB_TOKEN` (CI) | ✅ Automática             | Sim       |
| PAT clássica        | ⚠️ Precisa ser adicionada | Depende   |
| Fine-grained PAT    | ⚠️ Precisa ser adicionada | Depende   |

**Se o Check Run retornar 403:** o PAT não tem permissão `checks:write`. O PR Comment continua funcionando normalmente.

### CTRF Report e retries

O CTRF reporter grava o estado **final** dos testes (após retries). Se um teste falhou inicialmente mas passou após retry:

- É registrado como `passed` com flag `flaky: true`
- Contagem de `flaky` e `retried` é incluída no summary
- A mensagem no PR comment esclarece que reflete "test execution results only"

### CI Context

O PR report detecta quando está rodando dentro de CI e exibe uma seção "CI Context" informando que:

- O report reflete apenas resultados de execução de testes
- O status da pipeline CI pode diferir se steps pós-teste falharam

---

## 7. Arquitetura

### Fluxo de dados

```
git push / open PR
    │
    ▼
GitHub Actions (.github/workflows/ci.yml)
    │
    ├── Step: Run tests → reports/ctrf-report.json
    │
    └── Step: QA Post-Process (if: always())
         │
         ▼
    shared/pr-report-core.ts
         │
         ├── config/features.json → lê feature toggle
         ├── reports/ctrf-report.json → parseia resultados
         ├── shared/quality-gate.ts → executa quality gate
         ├── shared/health-score.ts → calcula health score
         ├── shared/report-html.ts → gera HTML report
         ├── shared/github-pr-comment.ts → posta comment no PR
         └── shared/github-check-run.ts → cria check run
```

### Arquivos relacionados

| Arquivo                                      | Função                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `shared/pr-report-core.ts`                   | Entry point principal (CLI + programmatic API) |
| `shared/feature-config.ts`                   | Leitura de `config/features.json`              |
| `shared/quality-gate.ts`                     | Execução do quality gate                       |
| `shared/health-score.ts`                     | Cálculo do health score                        |
| `shared/report-html.ts`                      | Geração do HTML report                         |
| `shared/github-pr-comment.ts`                | Postagem de comment no PR                      |
| `shared/github-check-run.ts`                 | Criação de check runs                          |
| `shared/metrics.ts`                          | Persistência de métricas históricas            |
| `setup/templates/github-ci.ts`               | Template da pipeline CI                        |
| `.github/actions/qa-post-process/action.yml` | Composite action                               |

---

## 8. Comandos Úteis

### Gerar report localmente (sem postar)

```bash
npx tsx shared/pr-report-core.ts \
  --ctrf reports/ctrf-report.json \
  --project meu-projeto \
  --html-output reports/pr-report.html
```

### Pular seções específicas

```bash
npx tsx shared/pr-report-core.ts \
  --ctrf reports/ctrf-report.json \
  --project meu-projeto \
  --no-ai \
  --no-quality \
  --no-flaky
```

### Reconfigurar via menu

```bash
npx tsx git_triggers/main.ts
# Selecionar: Configurar PR Report
```

---

## 9. Solução de Problemas

| Problema                       | Causa                                                 | Solução                                                 |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| "PR Report disabled in config" | `config/features.json` não existe ou `enabled: false` | Criar/editar `config/features.json`                     |
| "PR comment not posted"        | Sem `GITHUB_PR_NUMBER` (não está em contexto de PR)   | Normal se rodando fora de PR                            |
| "Check Run 403"                | PAT sem permissão `checks:write`                      | Usar `GITHUB_TOKEN` do CI ou adicionar permissão ao PAT |
| "HTML report não gerado"       | CTRF report não encontrado                            | Verificar path com `--ctrf`                             |
| "Quality Gate: FAIL"           | Métricas abaixo dos thresholds                        | Verificar health score e ajustar código                 |
| Report não aparece no PR       | Step `if: always()` não configurado na CI             | Verificar `.github/workflows/ci.yml`                    |
