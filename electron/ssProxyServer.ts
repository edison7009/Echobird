
/**
 * SS Proxy Server - Transparent Proxy Mode (Supports Shadowsocks AEAD Protocol)
 */

import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';
import { Duplex } from 'stream';
import * as crypto from 'crypto';

// SS Node Config
export interface SSNodeConfig {
    name: string;
    server: string;
    port: number;
    cipher: string;
    password: string;
}

// Route Config (Old Mode)
interface RouteConfig {
    targetUrl: string;
    ssNode: SSNodeConfig;
}

// Proxy Rules
export interface ProxyRule {
    pattern: string;
    enabled: boolean;
}

// Default Rules
const DEFAULT_RULES: ProxyRule[] = [
    { pattern: '*.openai.com', enabled: true },
    { pattern: '*.anthropic.com', enabled: true },
    { pattern: '*.googleapis.com', enabled: true },
    { pattern: '*.google.com', enabled: true },
];

// --- Shadowsocks AEAD Implementation Start ---

const HKDF_INFO = "ss-subkey";
const PAYLOAD_SIZE_MASK = 0x3FFF;

interface CipherInfo {
    algorithm: string;  // Node.js crypto 算法名
    keyLen: number;
    saltLen: number;
    nonceLen: number;
    tagLen: number;
}

const CIPHERS: { [key: string]: CipherInfo } = {
    'aes-128-gcm': { algorithm: 'aes-128-gcm', keyLen: 16, saltLen: 16, nonceLen: 12, tagLen: 16 },
    'aes-256-gcm': { algorithm: 'aes-256-gcm', keyLen: 32, saltLen: 32, nonceLen: 12, tagLen: 16 },
    'chacha20-ietf-poly1305': { algorithm: 'chacha20-poly1305', keyLen: 32, saltLen: 32, nonceLen: 12, tagLen: 16 },
};

// MD5 KDF (EVP_BytesToKey equivalent)
function kdf(password: string, keyLen: number): Buffer {
    // 使用 any 类型避免 TS5.x Buffer<ArrayBufferLike> 泛型兼容性问题
    let key: any = Buffer.alloc(0);
    let prev: any = Buffer.alloc(0);
    const passBuf = Buffer.from(password);

    while (key.length < keyLen) {
        const h = crypto.createHash('md5');
        h.update(prev);
        // @ts-ignore - TS5.x Buffer<ArrayBufferLike> 泛型兼容性问题
        h.update(passBuf);
        const digest = h.digest();
        key = Buffer.concat([key, digest]);
        prev = digest;
    }
    return key.subarray(0, keyLen);
}

// HKDF-SHA1
function hkdfSha1(secret: Buffer, salt: Buffer, info: string, length: number): Buffer {
    // extract
    const prk = crypto.createHmac('sha1', salt).update(secret).digest();

    // expand
    const infoBuf = Buffer.from(info);
    let result = Buffer.alloc(0);
    let prev = Buffer.alloc(0);
    let i = 1;

    while (result.length < length) {
        const h = crypto.createHmac('sha1', prk);
        h.update(prev);
        h.update(infoBuf);
        h.update(Buffer.from([i]));
        const digest = h.digest();
        result = Buffer.concat([result, digest]) as any;
        prev = digest;
        i++;
    }

    return result.subarray(0, length);
}

// Increment Nonce (Little Endian)
function incrementNonce(nonce: Buffer) {
    for (let i = 0; i < nonce.length; i++) {
        nonce[i]++;
        if (nonce[i] !== 0) return;
    }
}

class ShadowsocksStream extends Duplex {
    private socket: net.Socket;
    private cipherInfo: CipherInfo;
    private psk: Buffer; // Pre-shared Key (Master Key)

    // Encryption state
    private encKey: Buffer | null = null;
    private encNonce: Buffer;
    private encSalt: Buffer | null = null;

    // Decryption state
    private decKey: Buffer | null = null;
    private decNonce: Buffer;
    private decSalt: Buffer | null = null;

    // Reading buffer
    private readBuffer: Buffer = Buffer.alloc(0);
    private readState: 'SALT' | 'LENGTH' | 'PAYLOAD' = 'SALT';
    private pendingPayloadLen: number = 0;

    constructor(socket: net.Socket, config: SSNodeConfig) {
        super();
        this.socket = socket;

        const cipherName = config.cipher.toLowerCase();
        this.cipherInfo = CIPHERS[cipherName] || CIPHERS['aes-128-gcm']; // Fallback/Default
        this.psk = kdf(config.password, this.cipherInfo.keyLen);

        this.encNonce = Buffer.alloc(this.cipherInfo.nonceLen);
        this.decNonce = Buffer.alloc(this.cipherInfo.nonceLen);

        // Handle socket events
        this.socket.on('data', (chunk) => this._onSocketData(chunk));
        this.socket.on('error', (err) => this.emit('error', err));
        this.socket.on('close', () => this.emit('close'));
        this.socket.on('end', () => this.push(null));

        // Initial handshake: Send Salt
        this._initEncryption();
    }

    private _initEncryption() {
        this.encSalt = crypto.randomBytes(this.cipherInfo.saltLen);
        this.encKey = hkdfSha1(this.psk, this.encSalt, HKDF_INFO, this.cipherInfo.keyLen);
        this.socket.write(this.encSalt);
    }

    private _initDecryption(salt: Buffer) {
        this.decSalt = salt;
        this.decKey = hkdfSha1(this.psk, this.decSalt, HKDF_INFO, this.cipherInfo.keyLen);
        this.readState = 'LENGTH';
    }

    // Encrypt and send data
    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        if (!this.encKey || !this.encSalt) {
            callback(new Error("Encryption not initialized"));
            return;
        }

        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        let offset = 0;

        while (offset < data.length) {
            const len = Math.min(data.length - offset, PAYLOAD_SIZE_MASK);
            const payload = data.subarray(offset, offset + len);

            // 1. Encrypt Length (2 bytes)
            const lenBuf = Buffer.alloc(2);
            lenBuf.writeUInt16BE(len, 0); // Big Endian Length
            const encLen = this._encryptChunk(lenBuf);
            this.socket.write(encLen);

            // 2. Encrypt Payload
            const encPayload = this._encryptChunk(payload);
            this.socket.write(encPayload);

            offset += len;
        }

        callback();
    }

    private _encryptChunk(plaintext: Buffer): Buffer {
        const cipher = crypto.createCipheriv(this.cipherInfo.algorithm as any, this.encKey!, this.encNonce);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();
        incrementNonce(this.encNonce);
        return Buffer.concat([ciphertext, tag]);
    }

    // Decrypt received data
    private _onSocketData(chunk: Buffer) {
        this.readBuffer = Buffer.concat([this.readBuffer, chunk]);
        this._processReadBuffer();
    }

    private _processReadBuffer() {
        while (true) {
            if (this.readState === 'SALT') {
                if (this.readBuffer.length < this.cipherInfo.saltLen) return;

                const salt = this.readBuffer.subarray(0, this.cipherInfo.saltLen);
                this.readBuffer = this.readBuffer.subarray(this.cipherInfo.saltLen);
                this._initDecryption(salt);
                continue;
            }

            if (this.readState === 'LENGTH') {
                // Length chunk size = 2 (encrypted bytes) + tagLen
                const lenChunkSize = 2 + this.cipherInfo.tagLen;
                if (this.readBuffer.length < lenChunkSize) return;

                const encLenChunk = this.readBuffer.subarray(0, lenChunkSize);
                this.readBuffer = this.readBuffer.subarray(lenChunkSize);

                try {
                    const lenBuf = this._decryptChunk(encLenChunk);
                    if (lenBuf.length !== 2) throw new Error("Invalid length chunk");
                    this.pendingPayloadLen = lenBuf.readUInt16BE(0) & PAYLOAD_SIZE_MASK;
                    this.readState = 'PAYLOAD';
                } catch (e) {
                    this.emit('error', e);
                    return;
                }
                continue;
            }

            if (this.readState === 'PAYLOAD') {
                const payloadChunkSize = this.pendingPayloadLen + this.cipherInfo.tagLen;
                if (this.readBuffer.length < payloadChunkSize) return;

                const encPayloadChunk = this.readBuffer.subarray(0, payloadChunkSize);
                this.readBuffer = this.readBuffer.subarray(payloadChunkSize);

                try {
                    const payload = this._decryptChunk(encPayloadChunk);
                    if (!this.push(payload)) {
                        // Backpressure handling if needed, but for now just push
                    }
                    this.readState = 'LENGTH'; // Ready for next chunk
                } catch (e) {
                    this.emit('error', e);
                    return;
                }
                continue;
            }
            break;
        }
    }

    private _decryptChunk(ciphertext: Buffer): Buffer {
        // Separate data and tag
        const tag = ciphertext.subarray(ciphertext.length - this.cipherInfo.tagLen);
        const data = ciphertext.subarray(0, ciphertext.length - this.cipherInfo.tagLen);

        const decipher = crypto.createDecipheriv(this.cipherInfo.algorithm as any, this.decKey!, this.decNonce);
        decipher.setAuthTag(tag);

        const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
        incrementNonce(this.decNonce);
        return plaintext;
    }

    _read(_size: number): void {
        // Handled by _onSocketData pushing
    }

    destroy(error?: Error): this {
        this.socket.destroy(error);
        super.destroy(error);
        return this;
    }
}

// --- Shadowsocks AEAD Implementation End ---

// Get config directory
function getProxyConfigDir(): string {
    // 打包后用 userData，开发模式用项目目录
    let baseDir: string;
    try {
        const { app } = require('electron');
        baseDir = app.isPackaged ? app.getPath('userData') : process.cwd();
    } catch {
        baseDir = process.cwd();
    }
    const configDir = path.join(baseDir, '.whichclaw', 'proxy');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    return configDir;
}

// Load rules
export function getProxyRules(): ProxyRule[] {
    const configDir = getProxyConfigDir();
    const rulesPath = path.join(configDir, 'rules.json');
    if (fs.existsSync(rulesPath)) {
        try {
            return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        } catch {
            return DEFAULT_RULES;
        }
    }
    return DEFAULT_RULES;
}

// Save rules
export function saveRules(rules: ProxyRule[]): void {
    const configDir = getProxyConfigDir();
    const rulesPath = path.join(configDir, 'rules.json');
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
}

// Check if address matches rules
export function shouldProxy(hostname: string): boolean {
    try {
        const rules = getProxyRules();
        for (const rule of rules) {
            if (!rule.enabled) continue;
            if (rule.pattern.startsWith('*.')) {
                const domain = rule.pattern.slice(2);
                if (hostname.endsWith(domain)) return true;
            }
            if (hostname === rule.pattern || (rule.pattern.startsWith('.') && hostname.endsWith(rule.pattern))) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

// Connect to SS Server
async function connectShadowsocks(config: SSNodeConfig, targetHost: string, targetPort: number): Promise<Duplex> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(config.port, config.server);

        socket.setTimeout(10000);
        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error(`Connection to SS server timeout (${config.server}:${config.port})`));
        });

        socket.on('error', (err) => {
            reject(new Error(`Failed to connect to SS server ${config.server}:${config.port} - ${err.message}`));
        });

        socket.on('connect', () => {
            socket.setTimeout(0); // Clear timeout

            // Wrap with SS encryption
            const ssStream = new ShadowsocksStream(socket, config);

            // Construct Target Address Payload (Type + Msg)
            // Type 3: Domain Name
            const hostBuf = Buffer.from(targetHost);
            const portBuf = Buffer.alloc(2);
            portBuf.writeUInt16BE(targetPort, 0);

            const targetAddr = Buffer.concat([
                Buffer.from([0x03, hostBuf.length]), // Type=3 (Domain), Len
                hostBuf,
                portBuf
            ]);

            // Write target address as first payload
            ssStream.write(targetAddr);

            resolve(ssStream);
        });
    });
}

// HTTP Proxy Server Class
class ProxyServer {
    private server: http.Server | null = null;
    private config: SSNodeConfig | null = null;
    private routes = new Map<string, RouteConfig>();
    private hostRules = new Map<string, SSNodeConfig>();
    private port: number = 0;

    async start(config?: SSNodeConfig): Promise<number> {
        this.config = config || null;

        this.server = http.createServer((req, res) => {
            // Simplified HTTP Proxy (Basic support)
            const urlStr = req.url || '';
            if (!urlStr) { res.writeHead(400); res.end('Missing URL'); return; }

            try {
                new URL(urlStr); // Validate URL
                // const hostname = url.hostname;
                // const port = parseInt(url.port) || 80;

                // HTTP Proxying (Not primarily used for HTTPS, but good to have)
                // For HTTP, we treat it as CONNECT conceptually -> just forward payload
                // But full HTTP proxy parsing is complex. We focus on CONNECT (tunnel) below.
                res.writeHead(501);
                res.end("HTTP Proxy mode not fully implemented, please use HTTPS/CONNECT for secure traffic.");
            } catch (e) {
                res.writeHead(400); res.end('Invalid URL');
            }
        });

        this.server.on('connect', (req, clientSocket, head) => {
            // HTTPS Tunnel
            const { port, hostname } = new URL(`http://${req.url}`);
            const targetPort = parseInt(port || '443');
            const targetHost = hostname;

            console.log(`[Proxy] Received CONNECT request for ${targetHost}:${targetPort}`);

            if (!targetHost) {
                clientSocket.end();
                return;
            }

            let ssNode = this.hostRules.get(targetHost);
            if (!ssNode && shouldProxy(targetHost)) {
                ssNode = this.config || undefined;
            }

            if (ssNode || (this.config && shouldProxy(targetHost))) {
                const nodeToUse = ssNode || this.config!;
                console.log(`[Proxy] Routing ${targetHost} via SS Node: ${nodeToUse.name}`);
                this.handleConnectSS(targetHost, targetPort, clientSocket, head, nodeToUse);
            } else {
                console.log(`[Proxy] Routing ${targetHost} DIRECT`);
                this.handleConnectDirect(targetHost, targetPort, clientSocket, head);
            }
        });

        this.server.on('connection', (socket) => {
            console.log(`[Proxy] New TCP connection from ${socket.remoteAddress}:${socket.remotePort}`);
            socket.on('error', (err) => console.error(`[Proxy] TCP Error: ${err.message}`));
        });

        return new Promise((resolve) => {
            this.server!.listen(0, '127.0.0.1', () => {
                const addr = this.server!.address();
                this.port = typeof addr === 'string' ? 0 : addr?.port || 0;
                console.log('[Proxy] Server started on port', this.port);
                resolve(this.port);
            });
        });
    }

    private async handleConnectSS(hostname: string, port: number, clientSocket: any, head: Buffer, config: SSNodeConfig) {
        try {
            console.log(`[Proxy] Connecting to SS ${config.server}:${config.port} for ${hostname}...`);
            const serverStream = await connectShadowsocks(config, hostname, port);
            console.log(`[Proxy] SS Tunnel established for ${hostname}`);

            clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                'Proxy-agent: WhichClaw-SS-Proxy\r\n' +
                '\r\n');

            // Pipe data
            if (head && head.length > 0) serverStream.write(head);
            serverStream.pipe(clientSocket);
            clientSocket.pipe(serverStream);

            serverStream.on('error', (err: any) => {
                console.log(`[Proxy] SS Tunnel error (server): ${err.message}`);
                clientSocket.end();
            });
            clientSocket.on('error', (err: any) => {
                console.log(`[Proxy] SS Tunnel error (client): ${err.message}`);
                serverStream.end();
            });
        } catch (err: any) {
            console.error(`[Proxy] CONNECT SS failed for ${hostname}:`, err.message);
            try {
                clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                clientSocket.end();
            } catch { }
        }
    }

    private handleConnectDirect(hostname: string, port: number, clientSocket: any, head: Buffer) {
        const serverSocket = net.connect(port, hostname, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                'Proxy-agent: WhichClaw-Direct\r\n' +
                '\r\n');
            if (head && head.length > 0) serverSocket.write(head);
            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);
        });

        serverSocket.on('error', (err) => {
            console.error(`[Proxy] CONNECT Direct failed for ${hostname}:`, err.message);
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.end();
        });
        clientSocket.on('error', () => serverSocket.end());
    }

    stop(): void {
        this.server?.close();
        this.routes.clear();
        this.hostRules.clear();
        console.log('[Proxy] Server stopped');
    }

    addRoute(modelId: string, targetUrl: string, ssNode: SSNodeConfig): string {
        this.routes.set(modelId, { targetUrl, ssNode });
        try {
            const url = new URL(targetUrl);
            this.hostRules.set(url.hostname, ssNode);
        } catch { }
        return `http://127.0.0.1:${this.port}/route/${modelId}`;
    }

    addHostRule(hostname: string, ssNode: SSNodeConfig): void {
        this.hostRules.set(hostname, ssNode);
        console.log(`[Proxy] Added host rule: ${hostname} -> SS:${ssNode.name}`);
    }

    clearHostRules(): void {
        this.hostRules.clear();
        console.log('[Proxy] Cleared host rules');
    }

    removeRoute(modelId: string): boolean {
        return this.routes.delete(modelId);
    }

    getPort(): number {
        return this.port;
    }
}

let proxyInstance: ProxyServer | null = null;

export async function startProxyServer(config?: SSNodeConfig): Promise<number> {
    if (!proxyInstance) {
        proxyInstance = new ProxyServer();
        return proxyInstance.start(config);
    }
    return proxyInstance.getPort();
}

export function stopProxyServer(): void {
    proxyInstance?.stop();
    proxyInstance = null;
}

export function addProxyRoute(modelId: string, targetUrl: string, ssNode: SSNodeConfig): string {
    if (!proxyInstance) throw new Error("Proxy server not started");
    return proxyInstance.addRoute(modelId, targetUrl, ssNode);
}

export function addHostRule(hostname: string, ssNode: SSNodeConfig): void {
    if (!proxyInstance) {
        console.warn("[Proxy] Attempted to add rule but server not started.");
        return;
    }
    proxyInstance.addHostRule(hostname, ssNode);
}

export function clearHostRules(): void {
    proxyInstance?.clearHostRules();
}

export function removeProxyRoute(modelId: string): boolean {
    return proxyInstance?.removeRoute(modelId) || false;
}

export function getProxyPort(): number {
    return proxyInstance?.getPort() || 0;
}

export function parseSSUrl(ssUrl: string): SSNodeConfig | null {
    try {
        const url = new URL(ssUrl);
        const params = new URLSearchParams(url.search);
        return {
            name: 'SS Proxy',
            server: url.hostname,
            port: parseInt(url.port) || 8388,
            cipher: params.get('cipher') || 'aes-256-gcm',
            password: params.get('password') || ''
        };
    } catch {
        return null;
    }
}
