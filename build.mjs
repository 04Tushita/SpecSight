import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const serve = process.argv.includes('--serve');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const options = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: 'dist/app.js',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  minify: !serve && !process.env.DEV,
  sourcemap: serve,
  target: ['es2020'],
  define: { 'process.env.NODE_ENV': serve || process.env.DEV ? '"development"' : '"production"' },
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`SpecSight running at http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
