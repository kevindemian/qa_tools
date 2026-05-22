import type { TestCase } from '../shared/types';

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

class TestCaseValidator {
  validate(tests: TestCase[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const titles = new Set<string>();

    tests.forEach((test, i) => {
      const idx = i + 1;

      if (!test.title || !test.title.trim()) {
        errors.push('Teste ' + idx + ': Titulo vazio');
      }

      if (test.title && titles.has(test.title.trim())) {
        warnings.push('Teste ' + idx + ': Titulo duplicado "' + test.title.trim() + '"');
      }
      if (test.title) titles.add(test.title.trim());

      if (!test.steps || test.steps.length === 0) {
        errors.push('Teste ' + idx + ' "' + (test.title || '(sem titulo)') + '": Nenhum step definido');
      } else {
        test.steps.forEach((step, si) => {
          const action = step.fields?.Action || '';
          if (!action.trim()) {
            warnings.push('Teste ' + idx + ' "' + test.title + '": Step ' + (si + 1) + ' sem Action');
          }
        });
      }
    });

    return { errors, warnings };
  }
}

export = TestCaseValidator;
