# Troubleshooting

Problemas comuns e como resolvê-los.

## Erro de conexão Jira

```
ERR  Erro de conexão: ECONNREFUSED
```

**Causa**: JIRA_BASE_URL incorreta ou servidor Jira inacessível.

**Solução**:

1. Verifique `.env`: `JIRA_BASE_URL` deve ser a URL base do Jira Server (ex.: `https://jira.empresa.com`)
2. Teste com a opção 12 "Diagnosticar conexão"
3. Confirme que o token em `JIRA_PERSONAL_TOKEN` é válido

## Token inválido / 401

```
ERR  Token inválido ou expirado — Sem permissão (401)
```

**Causa**: Token Jira expirou ou não tem permissão.

**Solução**:

1. Gere um novo token em **Perfil Jira → Personal Access Tokens**
2. Atualize `JIRA_PERSONAL_TOKEN` no `.env`
3. Teste com opção 12

## Erro ao criar issues — "Issue type not found"

```
ERR  Tipo de issue não encontrado
```

**Causa**: O tipo de issue "Test" (ou "Test Execution") não está habilitado no projeto Jira.

**Solução**:

1. Acesse **Project Settings → Issue Types** no Jira
2. Adicione "Test" e "Test Execution" aos tipos do projeto
3. Se estiver usando Xray, verifique se o add-on Xray está ativo

## Pre-condition não associada

**Causa**: O campo customizado de pre-condition do Xray não foi encontrado automaticamente.

**Solução**: O sistema descobre o campo automaticamente via API. Se falhar:

1. Verifique se o Xray está instalado e configurado
2. Confirme que o campo `customfield_13708` (ou similar) existe no projeto
3. Tente novamente — o link manager tem cache de link types

## Erro Git — "Branch not found"

```
WARN  Branch 'feature/x' não encontrada em gitlab
```

**Causa**: O branch informado não existe no repositório remoto.

**Solução**:

1. Verifique o nome do branch no config/projects.json
2. Confirme que o branch foi criado e feito push
3. Verifique se `GIT_TOKEN` tem permissão de leitura no repositório

## Pipeline polling não encontra artefatos

**Causa**: O nome do artefato Mochawesome não corresponde ao esperado.

**Solução**:

1. Verifique se o pipeline gera artefatos com nome contendo "mochawesome" ou "results"
2. Ajuste o padrão de busca em `git_triggers/main.ts`
3. Confirme que o artefato é um arquivo JSON válido

## Menu não aparece (modo não-interativo)

**Causa**: O terminal não é TTY ou `QUIET=true` está ativo.

**Solução**:

- O sistema usa fallback para input numérico com `readline-sync`
- Para CI, use `AUTO_CONFIRM=true AUTO_CHOICE=<numero>` para execução automática

## Erro "ENOENT" ao ler CSV/JSON

**Causa**: O caminho do arquivo informado não existe.

**Solução**:

1. Confirme o caminho absoluto ou relativo
2. Use tab completion ou `pwd` para verificar diretório atual
3. Passe o caminho via env var `CSV_PATH` para evitar prompt

## Logs

Os logs são salvos em:

- `logs/` (relativo ao diretório do projeto, se `LOG_FILE=true`)
- Console (sempre, exceto se `QUIET=true`)
- `writeFileOnly` (sempre, mesmo em modo quiet)

Para debug avançado: `DEBUG=true npx tsx jira_management/main.ts`

---

## LLM — Falha na análise de falhas

```
ERR  LLM report + fallback failed
```

**Causa**: Tier `report` não retornou JSON parseável e tier `main` também falhou (rede, quota, API key inválida).

**Solução**:

1. Teste a API key manualmente:
    ```bash
    curl -H "Authorization: Bearer $LLM_API_KEY" $LLM_BASE_URL/models
    ```
2. Verifique se `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` estão no `.env`
3. Se estiver usando rate-limited (429), aguarde e tente novamente
4. Verifique logs em `logs/qa-tools-*.log` para mensagens de erro HTTP

## LLM — Fallback ativado (confidence baixo)

```
⚠ Análise IA indisponível — exibindo relatório template.
```

**Causa**: Report ou reviewer retornou confidence `low` ou falhou após 3 retries.

**Solução**:

1. Verifique o snapshot de métricas em `~/.local/state/qa-tools/llm-metrics.json`
    - `rejectedByValidator` alto → schema muito restritivo ou LLM não segue instruções
    - `failuresByTier.report` > 0 → problema no provedor **report** (OpenRouter)
    - `failuresByTier.reviewer` > 0 → problema no provedor **reviewer** (Gemini)
2. Tente trocar o modelo para um mais capaz (ex: `gpt-4o` no `LLM_MODEL`)
3. Aumente `MAX_RETRIES` em `llm-review.ts` se falhas forem intermitentes

## LLM — JSON inválido / validação rejeita

```
Validation errors: field "tests[0].classification" is required
```

**Causa**: LLM não seguiu o schema esperado no primeiro retry. O sistema tenta até 3 retries com feedback dos erros.

**Solução**:

1. O sistema já tenta corrigir automaticamente (retry com erros no prompt)
2. Se persistir, verifique se o prompt em `shared/prompts/failure-analysis.md` está claro
3. Considere usar `gpt-4o` ou `claude-3` no tier **report** para melhor aderência a schema
4. Verifique `rejectionReasons` no snapshot de métricas para entender quais campos falham

## LLM — Confidence baixo no relatório

```
Confiança: 🔴 low
```

**Causa**: Reviewer tier discordou da análise (`DISAGREE`), indicando erros factuais ou omissões.

**Solução**:

1. Revise o prompt de análise em `shared/prompts/failure-analysis.md` — pode faltar contexto
2. Troque o modelo do tier **reviewer** para um mais capaz (ex: `gemini-2.0-flash-thinking`)
3. Se for falso negativo (análise correta mas revisor discordou), ajuste o prompt de review em `llm-review.ts`
4. Ignore o confidence se a análise parecer correta — o badge é informativo, não bloqueante

## LLM — PR Description vazia

```
generatePrDescription retornou string vazia
```

**Causa**: Tier **fast** (Groq) falhou ou diff muito grande.

**Solução**:

1. Verifique `LLM_FAST_API_KEY` e `LLM_FAST_BASE_URL`
2. Groq tem limite de contexto (~8K tokens para `llama3-8b`); diffs muito grandes são truncados
3. Considere trocar para `LLM_FAST_MODEL=mixtral-8x7b-32768` (maior contexto) se os diffs forem extensos

---

[← Voltar ao README](../README.md)
