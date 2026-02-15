/**
 * llama-server 运行时下载器
 * 检测本地是否安装 llama-server，未安装时从 GitHub Releases 下载对应平台的二进制
 */
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

// llama.cpp 版本（与 build.yml 保持一致）
const LLAMA_VERSION = 'b7981';
const LLAMA_CUDA_VER = '13.1';

// 下载基地址（含镜像回退，按优先级排序）
// 中国用户无法直连 GitHub Releases，自动回退到镜像
const GITHUB_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}`;
const DOWNLOAD_MIRRORS = [
    GITHUB_BASE,                                    // 1. GitHub 直连
    `https://ghfast.top/${GITHUB_BASE}`,            // 2. ghfast 镜像
    `https://ghproxy.net/${GITHUB_BASE}`,           // 3. ghproxy.net 镜像
    `https://ghproxy.homeboyc.cn/${GITHUB_BASE}`,   // 4. ghproxy.homeboyc 镜像
    `https://github.ur1.fun/${GITHUB_BASE}`,        // 5. ur1.fun 镜像
    `https://gh-proxy.com/${GITHUB_BASE}`,          // 6. gh-proxy 镜像
    `https://mirror.ghproxy.com/${GITHUB_BASE}`,    // 7. ghproxy 镜像
];

/**
 * 获取当前平台需要下载的文件名列表
 */
function getPlatformFileNames(): string[] {
    const platform = process.platform;

    if (platform === 'win32') {
        // Windows: CUDA 版 + CUDA 运行时
        return [
            `llama-${LLAMA_VERSION}-bin-win-cuda-${LLAMA_CUDA_VER}-x64.zip`,
            `cudart-llama-bin-win-cuda-${LLAMA_CUDA_VER}-x64.zip`,
        ];
    } else if (platform === 'darwin') {
        // macOS: ARM Metal
        return [`llama-${LLAMA_VERSION}-bin-macos-arm64.tar.gz`];
    } else {
        // Linux: x64 CPU
        return [`llama-${LLAMA_VERSION}-bin-ubuntu-x64.tar.gz`];
    }
}

/**
 * 测速选择最快镜像下载
 * 并行测试所有镜像 5 秒内的下载速度，选最快的继续下载
 * 如果最快的后续失败，回退到下一个
 */
async function downloadFileWithMirror(
    fileName: string,
    destPath: string,
    onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
    console.log(`[LlamaDownloader] Speed testing ${DOWNLOAD_MIRRORS.length} mirrors...`);

    // 阶段1：并行测速（每个镜像下载 5 秒，记录速度）
    const speedResults = await Promise.all(
        DOWNLOAD_MIRRORS.map((mirrorBase, i) => {
            const mirrorName = i === 0 ? 'GitHub' : new URL(mirrorBase).hostname;
            const url = `${mirrorBase}/${fileName}`;
            return testMirrorSpeed(url, mirrorName);
        })
    );

    // 按速度排序（最快的在前）
    const sorted = speedResults
        .filter(r => r.speed > 0) // 排除失败的
        .sort((a, b) => b.speed - a.speed);

    if (sorted.length === 0) {
        throw new Error('All mirrors unreachable');
    }

    console.log('[LlamaDownloader] Mirror speed results:');
    sorted.forEach(r => console.log(`  ${r.name}: ${(r.speed / 1024).toFixed(0)} KB/s`));
    console.log(`[LlamaDownloader] Selected: ${sorted[0].name}`);

    // 阶段2：用最快的镜像下载，失败则回退
    let lastError: Error | null = null;
    for (const mirror of sorted) {
        if (downloadCancelled) throw new Error('Download cancelled');
        try {
            console.log(`[LlamaDownloader] Downloading via ${mirror.name}: ${mirror.url}`);
            await downloadFile(mirror.url, destPath, onProgress);
            console.log(`[LlamaDownloader] Success via ${mirror.name}`);
            return;
        } catch (err: any) {
            lastError = err;
            console.warn(`[LlamaDownloader] ${mirror.name} failed: ${err.message}`);
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch { /* 忽略 */ }
            if (downloadCancelled) throw err;
        }
    }
    throw lastError || new Error('All download mirrors failed');
}

/**
 * 测试单个镜像的下载速度（5 秒内下载的字节数）
 */
function testMirrorSpeed(url: string, name: string): Promise<{ name: string; url: string; speed: number }> {
    return new Promise((resolve) => {
        const TEST_DURATION = 5000; // 5 秒测试
        let bytes = 0;
        let settled = false;
        let activeReq: any = null;
        const startTime = Date.now();

        const done = () => {
            if (settled) return;
            settled = true;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? bytes / elapsed : 0;
            try { activeReq?.destroy(); } catch { /* 忽略 */ }
            console.log(`[LlamaDownloader] Speed test ${name}: ${(speed / 1024).toFixed(0)} KB/s (${(bytes / 1024).toFixed(0)} KB in ${elapsed.toFixed(1)}s)`);
            resolve({ name, url, speed });
        };

        const handleRedirect = (currentUrl: string, redirectCount: number) => {
            if (redirectCount > 5 || settled) { done(); return; }

            try {
                const client = currentUrl.startsWith('https') ? https : http;
                const r = client.get(currentUrl, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const nextUrl = new URL(res.headers.location, currentUrl).href;
                        handleRedirect(nextUrl, redirectCount + 1);
                        return;
                    }
                    if (res.statusCode !== 200) { done(); return; }
                    res.on('data', (chunk: Buffer) => { bytes += chunk.length; });
                    setTimeout(done, TEST_DURATION);
                });
                activeReq = r;
                r.on('error', () => done());
                r.setTimeout(8000, () => { r.destroy(); done(); });
            } catch { done(); }
        };

        try {
            const client = url.startsWith('https') ? https : http;
            const r = client.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const nextUrl = new URL(res.headers.location, url).href;
                    handleRedirect(nextUrl, 1);
                    return;
                }
                if (res.statusCode !== 200) { done(); return; }
                res.on('data', (chunk: Buffer) => { bytes += chunk.length; });
                setTimeout(done, TEST_DURATION);
            });
            activeReq = r;
            r.on('error', () => done());
            r.setTimeout(8000, () => { r.destroy(); done(); });
        } catch { done(); }
    });
}

/**
 * 获取 llama-server 的安装目录（userData 下）
 */
export function getLlamaInstallDir(): string {
    return path.join(app.getPath('userData'), 'llama-server');
}

/**
 * 获取 llama-server 的 bin 目录
 */
function getLlamaBinDir(): string {
    return path.join(getLlamaInstallDir(), 'bin');
}

/**
 * 检查 llama-server 是否已安装
 */
export function isLlamaServerInstalled(): boolean {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    const binDir = getLlamaBinDir();

    if (!fs.existsSync(binDir)) return false;

    // 直接在 bin 目录下查找
    const directPath = path.join(binDir, exeName);
    if (fs.existsSync(directPath)) return true;

    // 在子目录中查找（如 llama-b7981-bin-xxx/ 目录）
    try {
        const entries = fs.readdirSync(binDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const exePath = path.join(binDir, entry.name, exeName);
                if (fs.existsSync(exePath)) return true;
            }
        }
    } catch {
        // 忽略读取错误
    }

    return false;
}

/**
 * 获取已安装的 llama-server 可执行文件路径
 */
export function findLlamaServerInUserData(): string | null {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    const binDir = getLlamaBinDir();

    if (!fs.existsSync(binDir)) return null;

    // 直接在 bin 目录下查找
    const directPath = path.join(binDir, exeName);
    if (fs.existsSync(directPath)) return directPath;

    // 在子目录中查找
    try {
        const entries = fs.readdirSync(binDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const exePath = path.join(binDir, entry.name, exeName);
                if (fs.existsSync(exePath)) return exePath;
            }
        }
    } catch {
        // 忽略
    }

    return null;
}

// 当前下载的 HTTP 请求引用（用于取消）
let currentDownloadRequest: any = null;
let currentWriteStream: fs.WriteStream | null = null;
let downloadCancelled = false;

/**
 * 取消 llama-server 下载
 */
export function cancelLlamaDownload() {
    downloadCancelled = true;

    // 先关闭写入流（释放文件句柄）
    if (currentWriteStream) {
        try { currentWriteStream.destroy(); } catch { /* 忽略 */ }
        currentWriteStream = null;
    }
    // 再销毁 HTTP 请求
    if (currentDownloadRequest) {
        currentDownloadRequest.destroy();
        currentDownloadRequest = null;
    }

    // 通知前端取消
    sendProgress({
        fileName: 'llama-server',
        progress: 0,
        downloaded: 0,
        total: 0,
        status: 'cancelled',
    });

    // 延迟清理临时文件（等待 OS 释放文件句柄）
    setTimeout(() => {
        const installDir = getLlamaInstallDir();
        const tempDir = path.join(installDir, 'temp');
        const binDir = getLlamaBinDir();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
        try { fs.rmSync(binDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
        try {
            const entries = fs.readdirSync(installDir);
            if (entries.length === 0) fs.rmdirSync(installDir);
        } catch { /* 忽略 */ }
        console.log('[LlamaDownloader] Download cancelled, temp files cleaned');
    }, 500);
}

/**
 * 发送下载进度到所有窗口
 * 同时发送到 llama-download-progress（按钮内进度）和 model:download-progress（底部 DownloadBar）
 */
function sendProgress(data: {
    fileName: string;
    progress: number;
    downloaded: number;
    total: number;
    status: string;
}) {
    for (const win of BrowserWindow.getAllWindows()) {
        // 按钮内的进度显示
        win.webContents.send('llama-download-progress', data);
        // 底部 DownloadBar（复用模型下载的通道）
        win.webContents.send('model:download-progress', data);
    }
}

/**
 * 通过 HTTP/HTTPS 下载文件（支持 GitHub 重定向）
 */
function downloadFile(url: string, destPath: string, onProgress: (downloaded: number, total: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const makeRequest = (currentUrl: string, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            const client = currentUrl.startsWith('https') ? https : http;
            const req = client.get(currentUrl, (res) => {
                // 保存请求引用用于取消
                currentDownloadRequest = req;
                // 处理重定向
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    makeRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${currentUrl}`));
                    return;
                }

                const total = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                const fileStream = createWriteStream(destPath);
                currentWriteStream = fileStream;
                res.on('data', (chunk: Buffer) => {
                    downloaded += chunk.length;
                    onProgress(downloaded, total);
                });

                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    currentWriteStream = null;
                    fileStream.close();
                    resolve();
                });
                fileStream.on('error', (err) => {
                    currentWriteStream = null;
                    // 取消时文件可能仍被锁定，不强制删除
                    if (!downloadCancelled) {
                        try { fs.unlinkSync(destPath); } catch { /* 忽略 */ }
                    }
                    reject(err);
                });
            });

            req.on('error', (err: any) => {
                // 用户取消时也 reject（用特殊错误标记）
                if (downloadCancelled) {
                    reject(new Error('Download cancelled'));
                    return;
                }
                reject(err);
            });
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        };

        makeRequest(url);
    });
}

/**
 * 解压 zip 文件（Windows）
 * 使用 PowerShell 的 Expand-Archive
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
        // 使用 PowerShell 解压
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
        exec(cmd, { timeout: 120000 }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * 解压 tar.gz 文件（macOS/Linux）
 */
async function extractTarGz(tarPath: string, destDir: string): Promise<void> {
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
        const cmd = `tar -xzf "${tarPath}" -C "${destDir}"`;
        exec(cmd, { timeout: 120000 }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * 下载并安装 llama-server
 * @returns 是否成功
 */
export async function downloadLlamaServer(): Promise<{ success: boolean; error?: string }> {
    const fileNames = getPlatformFileNames();
    const binDir = getLlamaBinDir();
    const tempDir = path.join(getLlamaInstallDir(), 'temp');

    try {
        // 重置取消标记
        downloadCancelled = false;
        currentDownloadRequest = null;

        // 创建目录
        mkdirSync(binDir, { recursive: true });
        mkdirSync(tempDir, { recursive: true });

        const totalFiles = fileNames.length;
        let completedFiles = 0;

        for (const fileName of fileNames) {
            const tempFilePath = path.join(tempDir, fileName);
            const extractDir = fileName.replace(/\.(zip|tar\.gz)$/, '');
            const extractPath = path.join(binDir, extractDir);

            console.log(`[LlamaDownloader] Preparing to download: ${fileName}`);

            // 阶段1: 下载（自动镜像回退）
            sendProgress({
                fileName: `llama-server`,
                progress: 0,
                downloaded: 0,
                total: 0,
                status: 'downloading',
            });

            await downloadFileWithMirror(fileName, tempFilePath, (downloaded, total) => {
                if (downloadCancelled) return;
                const fileProgress = Math.round((downloaded / total) * 100);
                // 总进度：每个文件占比 = 1/totalFiles
                const overallProgress = Math.round(((completedFiles + downloaded / total) / totalFiles) * 100);

                sendProgress({
                    fileName: `llama-server`,
                    progress: overallProgress,
                    downloaded,
                    total,
                    status: 'downloading',
                });
            });

            // 阶段2: 解压
            console.log(`[LlamaDownloader] Extracting: ${fileName}`);
            sendProgress({
                fileName: `llama-server`,
                progress: Math.round(((completedFiles + 0.9) / totalFiles) * 100),
                downloaded: 0,
                total: 0,
                status: 'downloading', // UI 上还是显示下载中
            });

            mkdirSync(extractPath, { recursive: true });
            if (fileName.endsWith('.zip')) {
                await extractZip(tempFilePath, extractPath);
            } else {
                await extractTarGz(tempFilePath, extractPath);
            }

            // 清理临时文件
            try { fs.unlinkSync(tempFilePath); } catch { /* 忽略 */ }

            completedFiles++;
        }

        // Linux/macOS: 给 llama-server 添加执行权限
        if (process.platform !== 'win32') {
            const exePath = findLlamaServerInUserData();
            if (exePath) {
                fs.chmodSync(exePath, 0o755);
                console.log(`[LlamaDownloader] Set executable permission: ${exePath}`);
            }
        }

        // 清理 temp 目录
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 忽略 */ }

        // 完成
        sendProgress({
            fileName: 'llama-server',
            progress: 100,
            downloaded: 0,
            total: 0,
            status: 'completed',
        });

        console.log(`[LlamaDownloader] Installation complete. Path: ${findLlamaServerInUserData()}`);
        return { success: true };

    } catch (err: any) {
        console.error('[LlamaDownloader] Download failed:', err);

        sendProgress({
            fileName: 'llama-server',
            progress: 0,
            downloaded: 0,
            total: 0,
            status: 'error',
        });

        // 清理临时文件
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 忽略 */ }

        return { success: false, error: err.message };
    }
}
