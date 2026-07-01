import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASH_BIN = '/usr/bin/bash';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QA_SCRIPT = resolve(__dirname, 'qa.sh');

describe('Qa.sh — OpenCode container wrapper', () => {
    describe('File integrity', () => {
        it('exists', () => {
            expect(existsSync(QA_SCRIPT)).toBeTruthy();
        });

        it('is executable', () => {
            const mode = statSync(QA_SCRIPT).mode;

            // Check owner execute bit (0o100) is set
            expect(mode & 0o100).toBeTruthy();
        });

        it('has shebang', () => {
            const content = readFileSync(QA_SCRIPT, 'utf-8');

            expect(content.startsWith('#!/usr/bin/env bash')).toBeTruthy();
        });

        it('passes bash syntax check', () => {
            // bash -n validates syntax without executing
            const result = execFileSync(BASH_BIN, ['-n', QA_SCRIPT], {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            expect(result).toBe('');
        });
    });

    describe('Podman command structure', () => {
        let content: string;

        beforeAll(() => {
            content = readFileSync(QA_SCRIPT, 'utf-8');
        });

        it('uses podman run --rm -it', () => {
            expect(content).toContain('podman run --rm -it');
        });

        it('uses --replace for resilience against orphan containers', () => {
            expect(content).toContain('--replace');
        });

        it('enables --read-only filesystem', () => {
            expect(content).toContain('--read-only');
        });

        it('drops all capabilities', () => {
            expect(content).toContain('--cap-drop ALL');
        });

        it('uses --userns keep-id', () => {
            expect(content).toContain('--userns keep-id');
        });

        it('maps container user to host via --user', () => {
            expect(content).toContain('--user "$(id -u):$(id -g)"');
        });

        it('mounts project root at /project', () => {
            expect(content).toContain('${PROJECT_ROOT}:/project:rw,z');
        });

        it('mounts opencode config as read-only', () => {
            expect(content).toContain('-v "${OPENCODE_CONFIG_HOME}:/home/coder/.config/opencode:ro,z"');
        });

        it('mounts opencode data directory for persistent SQLite DB', () => {
            expect(content).toContain('OPENCODE_DATA_HOME');
            expect(content).toContain('-v "${OPENCODE_DATA_HOME}:/home/coder/.local/share/opencode:rw,z"');
        });

        it('creates data directory if it does not exist', () => {
            expect(content).toContain('mkdir -p "${OPENCODE_DATA_HOME}"');
        });

        it('mounts .gitconfig conditionally with :ro', () => {
            expect(content).toContain('GITCONFIG_MOUNT="-v ${GITCONFIG}:/home/coder/.gitconfig:ro"');
        });

        it('uses .env.local with priority over .env', () => {
            expect(content).toContain('ENV_FILE="--env-file ${PROJECT_ROOT}/.env.local"');
        });

        it('falls back to .env when .env.local absent', () => {
            expect(content).toContain('ENV_FILE="${ENV_FILE} --env-file ${PROJECT_ROOT}/.env"');
        });

        it('uses host networking', () => {
            expect(content).toContain('--network host');
        });

        it('creates writable /tmp via tmpfs (exec necessário para JIT Node.js/bun)', () => {
            expect(content).toContain('--tmpfs /tmp:nosuid,size=128m');
        });

        it('creates writable .opencode via tmpfs com noexec', () => {
            expect(content).toContain('--tmpfs /home/coder/.opencode:noexec,size=64m');
        });

        it('does NOT mount .local as tmpfs (avoid shadowing bind mount at .local/share/opencode)', () => {
            expect(content).not.toContain('--tmpfs /home/coder/.local:noexec,size=64m');
        });

        it('creates writable .local/state via tmpfs com noexec (fix EACCES opencode state dir)', () => {
            expect(content).toContain('--tmpfs /home/coder/.local/state:noexec,size=128m');
        });

        it('creates writable .cache via tmpfs com noexec', () => {
            expect(content).toContain('--tmpfs /home/coder/.cache:noexec,size=64m');
        });

        it('detects missing podman with user-friendly error', () => {
            expect(content).toContain('podman não encontrado');
        });

        it('detects missing image with build instruction', () => {
            expect(content).toContain('imagem');
            expect(content).toContain('podman build -t');
        });
    });

    describe('Edge cases', () => {
        it('handles set -euo pipefail for strict error handling', () => {
            const content = readFileSync(QA_SCRIPT, 'utf-8');

            expect(content).toContain('set -euo pipefail');
        });

        it('handles empty arguments (passthrough "$@"', () => {
            const content = readFileSync(QA_SCRIPT, 'utf-8');

            expect(content).toContain('"$@"');
        });

        it('passes arguments after image name', () => {
            const content = readFileSync(QA_SCRIPT, 'utf-8');
            // Find the exec command block (multi-line, ends with "$@")
            const execBlock = content.slice(content.lastIndexOf('exec podman run'));

            expect(execBlock).toContain('"$@"');

            // "$@" must be after the IMAGE reference
            const imagePos = execBlock.lastIndexOf('"${IMAGE}"');
            const argsPos = execBlock.lastIndexOf('"$@"');

            expect(argsPos).toBeGreaterThan(imagePos);
        });
    });
});
