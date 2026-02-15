// 双版本打包脚本
// 用法: node scripts/build-edition.mjs [full|lite]
//   full = 完整版 (含本地模型服务器 CUDA 二进制，~571MB)
//   lite = 轻量版 (不含本地模型服务器二进制，~200MB)

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const edition = process.argv[2] || 'full';
if (!['full', 'lite'].includes(edition)) {
    console.error('Usage: node scripts/build-edition.mjs [full|lite]');
    process.exit(1);
}

console.log(`\n========== Building WhichClaw [${edition.toUpperCase()}] ==========\n`);

// 读取 package.json
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const originalPkg = fs.readFileSync(pkgPath, 'utf-8');

try {
    // 轻量版：修改 extraResources 排除 bin/ 目录
    if (edition === 'lite') {
        pkg.build.extraResources = [
            {
                from: 'electron/local',
                to: 'local',
                filter: [
                    '**/*',
                    '!modelSettings.json',
                    '!models/**',
                    '!bin/**'  // 排除 CUDA + llama 二进制
                ]
            }
        ];
        // 也不需要 asarUnpack node-llama-cpp
        pkg.build.asarUnpack = [];
        // 修改产品名称区分版本
        pkg.build.productName = 'WhichClaw Lite';
        pkg.build.nsis = {
            ...pkg.build.nsis,
            artifactName: 'WhichClaw-Lite-Setup-${version}.${ext}'
        };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    } else {
        // 完整版：确保产品名和安装包名
        pkg.build.nsis = {
            ...pkg.build.nsis,
            artifactName: 'WhichClaw-Setup-${version}.${ext}'
        };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    // 设置环境变量
    const env = {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        EDITION: edition
    };

    // 根据当前平台自动选择构建目标
    const platformTarget = process.platform === 'darwin'
        ? '--mac dmg'
        : process.platform === 'linux'
            ? '--linux AppImage'
            : '--win nsis';

    const steps = [
        { name: 'copy:config', cmd: 'npm run copy:config' },
        { name: 'build:tools', cmd: 'npm run build:tools' },
        { name: 'build:main', cmd: 'npm run build:main' },
        { name: 'vite build', cmd: 'npx vite build' },
        { name: 'electron-builder', cmd: `npx electron-builder ${platformTarget}` },
    ];

    for (const step of steps) {
        console.log(`\n--- ${step.name} ---`);
        execSync(step.cmd, { env, stdio: 'inherit', cwd: process.cwd() });
    }

    console.log(`\n========== Build [${edition.toUpperCase()}] Complete ==========`);
    console.log(`Output: release/\n`);

} finally {
    // 恢复原始 package.json
    fs.writeFileSync(pkgPath, originalPkg);
}
