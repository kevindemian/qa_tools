# Formato JSON para Importação de Testes (Opção 15)

## 1. Estrutura Geral

O arquivo JSON deve conter um **array de objetos**, onde cada objeto representa um caso de teste com suas propriedades e passos.

## 2. Propriedades

| Propriedade | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | `string` | Sim | Título do caso de teste |
| `description` | `string` | Não | Descrição detalhada do teste |
| `precondition` | `string` | Não | Pré-condição. Se for uma key Jira válida (ex: `CALC-123`), é tratada como referência a outro issue. Caso contrário, é tratada como texto inline. |
| `group` | `string` | Não | Nome do grupo/ suite para organização |
| `steps` | `array` | Sim | Array de objetos de passo (ver formato abaixo) |
| `labels` | `array` | Não | Array de strings com labels Jira |
| `linkedIssues` | `array` | Não | Array de strings (keys Jira) ou objetos `{ key, linkType? }`. O `linkType` padrão é `Tests`. |

### Formato de cada passo (`steps[]`)

Cada item do array `steps` é um objeto com as seguintes chaves:

| Campo | Tipo | Descrição |
|---|---|---|
| `Action` | `string` | Ação a ser executada |
| `Data` | `string` | Dado de entrada (opcional) |
| `ExpectedResult` | `string` | Resultado esperado (opcional) |

> **Atenção:** as chaves usam **PascalCase** (`Action`, `Data`, `ExpectedResult`) por refletirem os cabeçalhos do formato CSV interno.

## 3. Exemplo Completo

```json
[
    {
        "title": "CT-001: Soma de dois números positivos",
        "description": "Verifica que a calculadora retorna a soma correta para números inteiros positivos.",
        "precondition": "Calculadora aberta no modo básico",
        "group": "Operações Aritméticas",
        "steps": [
            {
                "Action": "Digitar número 5",
                "Data": "5",
                "ExpectedResult": "Display mostra 5"
            },
            {
                "Action": "Clicar no botão +",
                "Data": "",
                "ExpectedResult": "Operador + exibido no display"
            },
            {
                "Action": "Digitar número 3",
                "Data": "3",
                "ExpectedResult": "Display mostra 3"
            },
            {
                "Action": "Clicar no botão =",
                "Data": "",
                "ExpectedResult": "Display mostra 8"
            }
        ],
        "labels": ["soma", "positivos", "regressão"],
        "linkedIssues": ["CALC-101", "CALC-202"]
    },
    {
        "title": "CT-002: Divisão por zero",
        "description": "Verifica que a calculadora exibe erro ao dividir por zero.",
        "precondition": "CALC-50",
        "group": "Operações Aritméticas",
        "steps": [
            {
                "Action": "Digitar número 10",
                "Data": "10",
                "ExpectedResult": "Display mostra 10"
            },
            {
                "Action": "Clicar no botão ÷",
                "Data": "",
                "ExpectedResult": "Operador ÷ exibido no display"
            },
            {
                "Action": "Digitar número 0",
                "Data": "0",
                "ExpectedResult": "Display mostra 0"
            },
            {
                "Action": "Clicar no botão =",
                "Data": "",
                "ExpectedResult": "Mensagem de erro exibida"
            }
        ],
        "labels": ["divisao", "zero", "erro"],
        "linkedIssues": [
            { "key": "CALC-303", "linkType": "Tests" },
            { "key": "CALC-404", "linkType": "is tested by" }
        ]
    }
]
```

## 4. Template

O template oficial está disponível em `jira_management/test_cases_template.json`.

---

← [Voltar ao README](../README.md) | [CSV Format](04-csv-format.md)
