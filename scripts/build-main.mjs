import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';

async function buildMain() {
    console.log('Building Main Process & Preload...');

    const outDir = 'dist-electron';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    try {
        // Build Main
        await build({
            entryPoints: ['electron/main.ts'],
            outfile: 'dist-electron/main.cjs',
            bundle: true,
            platform: 'node',
            target: 'node18',
            external: ['electron', 'express', 'node-llama-cpp', 'fsevents'], // Exclude native/electron deps
            format: 'cjs',
            sourcemap: 'inline',
        });
        console.log('Main process built.');

        // Build Preload
        await build({
            entryPoints: ['electron/preload.ts'],
            outfile: 'dist-electron/preload.cjs',
            bundle: true,
            platform: 'node',
            target: 'node18',
            external: ['electron'],
            format: 'cjs',
            sourcemap: 'inline',
        });
        console.log('Preload built.');

    } catch (e) {
        console.error('Main/Preload build failed:', e);
        process.exit(1);
    }
}

buildMain();
