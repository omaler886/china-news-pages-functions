/**
 * Build script for china-news-pages-functions.
 *
 * Currently the worker is a single file (public/_worker.js).
 * The src/ directory contains the intended modular structure for future
 * refactoring with esbuild bundling. Once the template-literal boundary
 * issues are resolved, switch this script to bundle src/index.js.
 */
import { copyFileSync } from 'fs';

copyFileSync('public/_worker.js', 'public/_worker.js');
console.log('Worker is currently a single file. Modular source lives in src/ for reference.');
console.log('To enable bundling: fix template literal boundaries in src/ then update build.mjs to use esbuild.');
