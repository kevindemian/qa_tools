# Metodologia — FASE: TESTES (ROBUSTEZ REAL)

Aplicada na verificação individual de artefatos cliente (ver `audit/verificacao-artefatos-plano.md`).

## Diretrizes de isolamento (anti-mock theater)

- **Proibido mockar lógica interna:** classes, funções, helpers, utilitários ou módulos locais desta demanda rodam integrados e reais.
- **Mocks estritos de fronteira:** apenas serviços externos inacessíveis localmente (Jira/GitHub HTTP via `JiraResourceLike`/GitHub client). Dados do DataHub são reais (fixtures), não mockados.
- **Validação de side effects:** confirmar persistência/mutação real, não só retorno.

## Metodologias obrigatórias

- **Property-based testing:** onde aplicável (escalas, agregações, guards).
- **Valores esperados intocáveis:** não alterar asserts de testes existentes para maquiar verde; corrigir a implementação.
- **Tratamento de erro:** edge cases e rejeições com a mesma rigidez do caminho feliz.
- **Loop raiz:** teste falha → corrige-se o código de produção na causa raiz → reinicia a bateria. Não se mascara o defeito.
