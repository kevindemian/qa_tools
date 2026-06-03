# Primeiros Passos — QA Tools

Guia rápido para usar o **Jira Management** pela primeira vez.

---

## 1. Executar a ferramenta

```bash
# Via npx (recomendado)
npx tsx jira_management/main.ts

# Via wrapper (descobre ferramentas automaticamente)
./qatools.sh
```

O wrapper `qatools.sh` detecta automaticamente os diretórios que possuem `main.ts` (como `jira_management/` e `git_triggers/`) e exibe um menu seletor antes de abrir a ferramenta escolhida.

---

## 2. Primeira execução — seleção de projeto

Na primeira execução, o CLI pergunta o nome do projeto Jira:

```
-> Nome do projeto Jira [ECSPOL]:
```

O valor padrão é `ECSPOL`. O nome escolhido é salvo em estado persistente e reutilizado nas próximas execuções. Para alterar depois, use a **Opção 9** no menu.

---

## 3. Menu principal

O menu é organizado em **categorias** com sub-menus. Ao selecionar uma categoria, as opções internas são exibidas:

```
  GERAÇÃO DE RELATÓRIOS
   17  Gerar relatório HTML
  GERAÇÃO DE CASOS DE TESTE
   1   Criar testes a partir de CSV
   11  Gerar template (CSV/JSON)
   13  Criar Test Execution para testes existentes
   15  Importar testes de JSON
   18  Gerar testes via User Story (IA)
  BUG REPORT
   20  Criar Bug Report
  ANÁLISE E HISTÓRICO
    19  Histórico / Cobertura
    21  Análise de gaps de cobertura
    22  Impacto de mudanças (test impact)
    23  Feedback de IA
    24  Setup wizard CI/CD
  RELEASES
   2   Listar versões de release
   3   Criar nova versão
   4   Atribuir fixVersion às tarefas
   5   Atualizar package.json + release notes
   6   Verificar status das tarefas
   7   Fechar tarefas automaticamente
   8   Publicar versão
  CONFIGURAÇÃO
   9   Alterar projeto Jira
   10  Alterar diretório git
   12  Diagnosticar conexão
   14  Alterar diretório Cypress
   16  Alterar diretório JSON
  UTILITÁRIOS
   d   Ver documentação (abre navegador)
   0   Voltar ao menu principal
   /help  Ajuda
```

O usuário digita o número da opção desejada. Também é possível usar **alias** em português ou inglês (ex.: `criar`, `versoes`, `fechar`, `bug`, `gaps`, `docs`, `exit`).

---

## 4. Comandos especiais durante o prompt

Em qualquer prompt de texto, os seguintes comandos estão disponíveis:

| Comando                                       | Descrição                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/help` ou `/h`                               | Exibe ajuda contextual geral                                                                                                                |
| `/help <tópico>` ou `/h <tópico>`             | Ajuda sobre um tópico específico (`csv`, `labels`, `group`, `precondition`, `project`, `version`, `transitions`, `template`, `diagnostics`) |
| `/help search <termo>` ou `/h search <termo>` | Busca por termo em todos os tópicos de ajuda                                                                                                |
| `/back` ou `/menu`                            | Volta ao menu principal (se em sub-menu) ou sai da aplicação (se no menu principal)                                                         |
| `/exit` ou `/sair`                            | Encerra a sessão                                                                                                                            |
| `/history`                                    | Mostra as últimas 10 operações registradas                                                                                                  |
| `/docs` ou `/d`                               | Abre a documentação completa no navegador (HTML gerado em lote)                                                                             |
| `/home`                                       | Volta ao menu de categorias principal                                                                                                       |

---

## 5. Auto-mode (CI/CD)

Para execução automatizada em pipelines, use variáveis de ambiente:

```bash
AUTO_CONFIRM=true AUTO_CHOICE=1 npx tsx jira_management/main.ts
```

- `AUTO_CONFIRM=true` — pula todas as confirmações (default: `false`)
- `AUTO_CHOICE=1` — seleciona a opção 1 automaticamente na inicialização (use `d` para abrir documentação)

Exemplo com `DRY_RUN` para simular sem chamadas de API:

```bash
DRY_RUN=true AUTO_CONFIRM=true AUTO_CHOICE=1 npx tsx jira_management/main.ts
```

---

## 6. Histórico persistente

As últimas **50 operações** ficam salvas em:

```
~/.local/state/qa-tools/state.json
```

O arquivo contém um array `history` com entradas no formato:

```json
{
    "op": "Criar testes",
    "detail": "testes.csv → 3 issues criadas",
    "status": "ok",
    "ts": "2026-05-22T10:30:00.000Z"
}
```

Um backup automático é mantido em `state.json.bak` no mesmo diretório.

---

## 7. Resumo da sessão

Ao sair (Opção 0 ou `/exit`), a ferramenta exibe um resumo:

```
========================================
  i Sessão encerrada.
  ✓ 3 operação(oes) concluída(s)
  ✗ 1 operação(oes) com erro
  i Últimas operacoes:
    OK Criar testes: testes.csv → 3 issues
    ERR Publicar versão: v2.7.0
  i Última operação: Publicar versão: v2.7.0
  i Log: logs/qa-tools-2026-05-22.log
  i Sessão: 127s
========================================
```

Estatísticas exibidas:

- Total de operações com sucesso (✓) e com erro (✗)
- Últimas 10 operações do histórico
- Caminho completo do arquivo de log
- Tempo decorrido da sessão em segundos

---

← [Voltar ao README](../README.md)
