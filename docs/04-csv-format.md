# Formato CSV para Importação de Testes (Opção 1)

## Estrutura Geral

O arquivo CSV é dividido em **blocos**. Cada bloco representa um caso de teste e é separado do próximo por `---` em uma linha isolada.

```
Bloco 1 (metadados + steps)
---
Bloco 2 (metadados + steps)
---
Bloco 3 ...
```

Cada bloco possui duas seções:

1. **Metadados** — linhas no formato `Chave: Valor` (antes do cabeçalho de steps)
2. **Steps** — linhas CSV a partir do cabeçalho `Action,Data,Expected Result`

## Metadados por Bloco

### `Title` (obrigatório)

```csv
Title: ECSPOL-TC01 - Login com credenciais válidas
```

- Único campo obrigatório.
- Bloco sem `Title` é ignorado com warning.
- O prefixo (ex: `ECSPOL-`) ajuda na detecção automática do projeto Jira.

### `Description` (opcional)

**Modo aspas (recomendado para multilinha):**

```csv
Description: "Este teste verifica o fluxo completo
de login do administrador."
```

**Modo range (fallback):**

```csv
Description: Este teste verifica o fluxo completo de login
```

No modo range o texto se estende até o próximo metadado ou `Action,Data,Expected Result`.

### `Pre-condition` (opcional)

Pode ser uma **chave Jira** (referência) ou **texto inline** (entre aspas).

**Referência a issue Jira existente:**

```csv
Pre-condition: ECSPOL-PRE-42
```

**Referência a teste criado no mesmo CSV (via `Group`):**

```csv
Pre-condition: ECSPOL-TC01
```

Se a pre-condition corresponder a um `Title` de outro bloco com o mesmo `Group`, o vínculo é resolvido automaticamente.

**Texto inline (quote mode):**

```csv
Pre-condition: "User must be logged in with admin privileges"
```

Se for texto livre (não parece uma key Jira), o conteúdo é concatenado à descrição do teste.

### `Linked Issues` (opcional)

Keys separadas por `;`, cada uma com o tipo de link entre parênteses:

```csv
Linked Issues: ECSPOL-100 (is tested by); ECSPOL-200 (relates to)
```

O tipo de link é resolvido dinamicamente via API (case-insensitive, fallback para `relates to`).

### `Group` (opcional)

```csv
Group: LOGIN-FLOW
```

Identificador para agrupar testes. Útil para:

- Organização lógica
- Cross-reference de `Pre-condition` entre testes do mesmo grupo

## Steps

Após os metadados, o cabeçalho deve ser exatamente:

```csv
Action,Data,Expected Result
```

Cada linha seguinte representa um passo do teste:

```csv
Acessar /login,https://app.example.com,Formulário de login exibido
Preencher email,admin@test.com,Campo aceita o valor
Clicar em Entrar,,Redirecionado para dashboard
```

Colunas:

| Coluna            | Obrigatório | Descrição                           |
| ----------------- | ----------- | ----------------------------------- |
| `Action`          | Sim         | Ação a ser executada                |
| `Data`            | Não         | Dados de entrada (vazio se omitido) |
| `Expected Result` | Não         | Resultado esperado                  |

### Generic Step

Se a coluna `Expected Result` estiver vazia, o passo é classificado como **generic step** (passo genérico, sem validação específica).

## Exemplo Completo

```csv
Title: ECSPOL-TC01 - Login com credenciais válidas
Description: "Verifica o fluxo feliz de login do administrador no sistema."
Pre-condition: ECSPOL-PRE-42
Linked Issues: ECSPOL-100 (is tested by)
Group: LOGIN-FLOW
---
Action,Data,Expected Result
Acessar /login,https://app.example.com,Formulário de login exibido
Preencher email,admin@test.com,Campo aceita o valor
Preencher senha,******,Campo aceita o valor
Clicar em Entrar,,Redirecionado para dashboard

---
Title: ECSPOL-TC02 - Login com senha incorreta
Description: "Testa a mensagem de erro ao usar senha inválida."
Pre-condition: "User must be logged out"
Group: LOGIN-FLOW
Action,Data,Expected Result
Acessar /login,https://app.example.com,Formulário de login exibido
Digitar senha,senha_errada,Mensagem de erro exibida
```

## Template

Um arquivo modelo completo está disponível na raiz do projeto:

```
test_steps_template.csv
```

Ele pode ser copiado automaticamente via **opção 11** no menu (`GERAÇÃO DE CASOS DE TESTE → Gerar template CSV/JSON`).

## Regras Importantes

| Regra                       | Descrição                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title obrigatório**       | Bloco sem `Title` é ignorado com warning                                                                                                                |
| **Expected Result vazio**   | Step classificado como "generic step"                                                                                                                   |
| **Pre-condition via Group** | Se a pre-condition referencia um `Title` de outro bloco com mesmo `Group`, o vínculo é resolvido automaticamente                                        |
| **Labels**                  | Podem ser passadas via variável de ambiente `CSV_LABELS` (separadas por vírgula, ex: `qa,regression,smoke`) ou informadas via prompt durante a execução |
| **Chave vs. texto**         | Pre-condition que corresponde ao padrão `/^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/` é tratada como referência Jira; caso contrário, como texto inline       |
| **Aspas duplas**            | Use `"valor, com vírgula"` para valores com vírgula; `""` para aspas literais                                                                           |
| **Codificação**             | UTF-8 sem BOM                                                                                                                                           |
| **Separador**               | Vírgula (`,`)                                                                                                                                           |
| **Linhas comentário**       | Linhas iniciando com `#` são ignoradas                                                                                                                  |

---

← [Voltar ao README](../README.md)
