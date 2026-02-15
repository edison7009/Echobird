// 从 SVG 生成三平台图标文件
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

const SVG_PATH = path.resolve('public/ico-desktop.svg');
const BUILD_DIR = path.resolve('build');

async function generate() {
    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true });
    }

    const svgBuffer = fs.readFileSync(SVG_PATH);

    // 1. 生成 512x512 PNG（Linux 和 electron-builder 通用）
    const png512 = path.join(BUILD_DIR, 'icon.png');
    await sharp(svgBuffer).resize(512, 512).png().toFile(png512);
    console.log('✅ icon.png (512x512)');

    // 2. 生成 256x256 PNG → 转换为 ICO（Windows）
    const png256Path = path.join(BUILD_DIR, '_icon256.png');
    await sharp(svgBuffer).resize(256, 256).png().toFile(png256Path);
    const icoBuffer = await pngToIco(png256Path);
    fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
    fs.unlinkSync(png256Path); // 清理临时文件
    console.log('✅ icon.ico (256x256)');

    // 3. 生成 1024x1024 PNG 用于 macOS icns（electron-builder 会自动生成 icns）
    const png1024 = path.join(BUILD_DIR, 'icon.png');
    await sharp(svgBuffer).resize(1024, 1024).png().toFile(png1024);
    console.log('✅ icon.png (1024x1024, for macOS icns auto-generation)');

    console.log('\n🎉 All icons generated in build/');
}

generate().catch(e => {
    console.error('❌ Icon generation failed:', e);
    process.exit(1);
});
