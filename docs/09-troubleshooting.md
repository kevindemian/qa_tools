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

[← Voltar ao README](../README.md)
