import path from 'path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const artifactRoot = import.meta.dirname;
const workspaceRoot = path.resolve(artifactRoot, '..', '..');
const versionExtensions = /\.(?:css|html|js|jsx|json|ts|tsx|yaml|yml)$/;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ['.git', '.turbo', 'dist', 'node_modules'].includes(entry.name)) {
      return [];
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return versionExtensions.test(entry.name) ? [entryPath] : [];
  });
}

function getStudyDeskBuildId(): string {
  const inputs = [
    ...sourceFiles(path.join(artifactRoot, 'public')),
    path.join(artifactRoot, 'index.html'),
    path.join(artifactRoot, 'vite.config.ts'),
    ...sourceFiles(path.join(artifactRoot, 'src')),
    ...sourceFiles(path.resolve(artifactRoot, '..', 'api-server', 'src')),
    ...sourceFiles(path.join(workspaceRoot, 'lib')),
  ].filter(existsSync).sort();
  const hash = createHash('sha256');
  for (const file of inputs) {
    hash.update(path.relative(workspaceRoot, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

const studyDeskBuildVersion = {
  name: 'study-desk-build-version',
  transformIndexHtml(html: string) {
    const tag = `<meta name="study-desk-build" content="${getStudyDeskBuildId()}">`;
    return html.replace('</head>', `  ${tag}\n</head>`);
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    studyDeskBuildVersion,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
