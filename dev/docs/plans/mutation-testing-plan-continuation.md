# Continuação do MUTATION-TESTING-PLAN.md

## Status atual
- Phase 1 (Setup): ✅
- Phase 2 (CI Enforcement): ✅
- Phase 3 (Property-Based Tests): ✅ 59+ arquivos
- Phase 4 (Mock Boundary Audit): ❌ scripts/audit-mock-boundaries.ts não criado

## Ação imediata
Criar `scripts/audit-mock-boundaries.ts` que:
1. Scaneia arquivos `*.test.ts` para encontrar `vi.mock()` e `vi.fn()` 
2. Classifica cada mock: interno (proibido) vs externo (permitido)
3. Reporta violations quando mocks de lógica interna são detectados
4. Integra ao CI como check no job quality

## Regras de classificação
- **Permitido (externo):** mocks de HTTP (nock, fetch), filesystem, readline, módulos de rede, APIs de terceiros
- **Proibido (interno):** mocks de classes, funções, helpers, utilitários ou módulos locais do projeto
