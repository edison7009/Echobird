import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';

// 递归复制目录
function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function buildTools() {
    console.log('Building tools...');

    // Find all tool entries (address.ts, model.ts)
    // We want to preserve structure: electron/tools/<tool>/<file>.ts -> dist-electron/tools/<tool>/<file>.js

    const entryPoints = await glob('electron/tools/*/*.ts');

    if (entryPoints.length === 0) {
        console.log('No tool files found to build.');
        return;
    }

    // Ensure output directory exists
    const outDir = 'dist-electron/tools';
    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    try {
        await build({
            entryPoints: entryPoints,
            outdir: outDir,
            outbase: 'electron/tools', // 保持子目录结构（如 openclaw/model.cjs）
            bundle: false, // Do not bundle, keep individual files for dynamic loading
            platform: 'node',
            format: 'cjs', // Electron uses CommonJS
            target: 'node18',
            sourcemap: false,
            outExtension: { '.js': '.cjs' },
        });

        console.log(`Successfully built ${entryPoints.length} tool files to ${outDir}`);

        // 复制 JSON 配置文件、CJS 模块和 HTML 页面到输出目录
        const extraFiles = await glob('electron/tools/*/*.{json,cjs,js,html}');
        for (const file of extraFiles) {
            const relativePath = path.relative('electron/tools', file);
            const destPath = path.join(outDir, relativePath);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(file, destPath);
        }
        console.log(`Copied ${extraFiles.length} extra files (JSON/CJS/HTML) to ${outDir}`);

        // 递归复制 default-skills 目录（内置技能，发布时需要打包）
        const defaultSkillsDirs = await glob('electron/tools/*/default-skills', { onlyDirectories: true });
        for (const skillsDir of defaultSkillsDirs) {
            const relativePath = path.relative('electron/tools', skillsDir);
            const destDir = path.join(outDir, relativePath);
            copyDirRecursive(skillsDir, destDir);
        }
        if (defaultSkillsDirs.length > 0) {
            console.log(`Copied ${defaultSkillsDirs.length} default-skills directories to ${outDir}`);
        }
    } catch (e) {
        console.error('Tool build failed:', e);
        process.exit(1);
    }
}

buildTools();
