import { defineConfig } from 'vitest/config';

// Configuração de vitest dedicada ao Stryker (mutation testing).
// Não usa o VitestCtrfReporter (custom) porque o Stryker executa o vitest
// dentro de um sandbox (.stryker-tmp) e o import relativo do reporter falha,
// fazendo o dry-run não encontrar nenhum teste ("No tests were executed").
// Aqui usamos apenas o reporter default; o Stryker coleta a cobertura internamente.
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        reporters: ['default'],
        exclude: [
            '**/node_modules/**',
            // Testes de contrato/integração que dependem do repo real no disco
            // (lêm arquivos do projeto, comparam hashes). Não são oráculos de
            // mutação e quebram no sandbox do Stryker. Separados do gate de mutação.
            'scripts/__tests__/quality-check.test.ts',
            'scripts/__tests__/opencode-db-maintenance.test.ts',
            // Testes que usam process.chdir(): o vitest em worker threads (pool do
            // Stryker) não suporta chdir. Válidos no npm test normal; incompatíveis
            // com o runner do Stryker. Excluídos apenas da suíte de mutação.
            'shared/__tests__/store-backend.test.ts',
            'shared/__tests__/git-sha.test.ts',
        ],
        testTimeout: 15000,
        hookTimeout: 30000,
        teardownTimeout: 5000,
    },
});
