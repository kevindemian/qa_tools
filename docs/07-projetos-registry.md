# 07 — Projetos (Multi-Projeto)

Este guia explica como o QA Tools trabalha com **vários projetos** e como você
seleciona, adiciona e gerencia projetos no dia a dia.

## Visão geral

Você registra cada projeto **uma única vez**. A partir daí, ao abrir o CLI, basta
escolher com qual projeto trabalhar — o QA Tools mantém as configurações,
credenciais e o histórico de cada projeto **separados**, sem interferência entre
eles. O projeto escolhido é lembrado para a próxima vez.

## Selecionar o projeto

Ao abrir o CLI (`npm run jira` ou `npm run git`), um menu inicial mostra seus
projetos antes de entrar no menu principal:

- **Nenhum projeto ainda:** escolha **"Adicionar projeto"** (abre o setup) ou
  **"Continuar sem projeto"** (modo legado).
- **Só um projeto:** ele é selecionado automaticamente.
- **Vários projetos:** aparece uma lista numerada, além de **"Adicionar projeto"**
  e **"Gerenciar projetos"**. Alguns itens podem ter marcadores:
  - **`[INVÁLIDO]`** — a pasta do projeto não existe mais. Use "Gerenciar
    projetos → Editar diretório" para corrigir.
  - **`[MIGRADO]`** — o projeto veio de uma configuração antiga (ver
    [Vindo de uma versão antiga](#vindo-de-uma-versão-antiga)).

Para pular o menu e ir direto a um projeto, use a flag ao abrir o CLI:

```bash
npm run jira -- --project meu_projeto
```

## Adicionar um projeto

Escolha **"Adicionar projeto"** no menu inicial (ou rode o Setup Wizard). O
assistente:

1. Detecta o framework de testes e o provedor Git do projeto.
2. Pergunta a chave do projeto no Jira/Xray (opcional).
3. Registra o projeto para uso nas próximas execuções.

Para registrar um projeto que está em **outra pasta**, informe o caminho:

```bash
npx tsx setup/main.ts --dir /caminho/do/projeto
```

## Gerenciar projetos

Escolha **"Gerenciar projetos"** no menu inicial para editar o diretório de um
projeto, ajustar seus dados ou removê-lo. Projetos marcados como **`[MIGRADO]`**
são protegidos contra edição e remoção pelo menu.

## Trabalhando sem projeto (modo legado)

Se você não registrar nenhum projeto, o CLI continua funcionando como antes:
escolha **"Continuar sem projeto"** e use as operações normalmente. Registrar
projetos é opcional e não quebra instalações antigas.

## Vindo de uma versão antiga?

Se você já usava a configuração antiga de projetos, ela é convertida
automaticamente na **primeira vez** que você abre o CLI — nenhuma ação é
necessária. Os projetos convertidos aparecem com o marcador **`[MIGRADO]`**.

## Problemas comuns

- **Projeto aparece como `[INVÁLIDO]`:** a pasta do projeto foi movida ou
  removida. Use "Gerenciar projetos → Editar diretório".
- **Não consigo editar/remover um projeto `[MIGRADO]`:** projetos migrados são
  protegidos pelo menu; registre-o novamente pelo Setup Wizard se precisar
  alterá-lo.

---

Veja também: [`06-env-vars.md`](06-env-vars.md), [`10-setup-wizard.md`](10-setup-wizard.md),
[`TECHDOC.md`](TECHDOC.md) (detalhes técnicos de armazenamento e formato).
