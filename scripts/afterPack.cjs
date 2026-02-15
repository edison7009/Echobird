// electron-builder afterPack 钩子
// 在打包完成后用 rcedit 嵌入图标（因为 signAndEditExecutable: false 跳过了默认的图标嵌入）
const { rcedit } = require('rcedit');
const path = require('path');

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') return;

    const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    const iconPath = path.resolve(__dirname, '../build/icon.ico');

    console.log(`[afterPack] Embedding icon: ${iconPath} -> ${exePath}`);

    try {
        await rcedit(exePath, {
            icon: iconPath,
            'version-string': {
                ProductName: 'WhichClaw',
                FileDescription: 'WhichClaw - AI Model & Skill Management',
                CompanyName: 'WhichClaw',
                LegalCopyright: 'Copyright 2026 WhichClaw',
            },
            'file-version': context.packager.appInfo.version,
            'product-version': context.packager.appInfo.version,
        });
        console.log('[afterPack] Icon embedded successfully');
    } catch (err) {
        console.error('[afterPack] Icon embed failed:', err.message);
    }
};
