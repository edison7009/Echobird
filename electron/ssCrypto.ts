/**
 * SS Proxy crypto utility functions (extracted for testability)
 * These are pure functions that use only Node.js crypto module.
 */
import * as crypto from 'crypto';

export const HKDF_INFO = "ss-subkey";

export interface CipherInfo {
    algorithm: string;
    keyLen: number;
    saltLen: number;
    nonceLen: number;
    tagLen: number;
}

export const CIPHERS: { [key: string]: CipherInfo } = {
    'aes-128-gcm': { algorithm: 'aes-128-gcm', keyLen: 16, saltLen: 16, nonceLen: 12, tagLen: 16 },
    'aes-256-gcm': { algorithm: 'aes-256-gcm', keyLen: 32, saltLen: 32, nonceLen: 12, tagLen: 16 },
    'chacha20-ietf-poly1305': { algorithm: 'chacha20-poly1305', keyLen: 32, saltLen: 32, nonceLen: 12, tagLen: 16 },
};

/** MD5 KDF (EVP_BytesToKey equivalent) */
export function kdf(password: string, keyLen: number): Buffer {
    let key: any = Buffer.alloc(0);
    let prev: any = Buffer.alloc(0);
    const passBuf = Buffer.from(password);

    while (key.length < keyLen) {
        const h = crypto.createHash('md5');
        h.update(prev);
        // @ts-ignore - TS5.x Buffer<ArrayBufferLike> generic compatibility
        h.update(passBuf);
        const digest = h.digest();
        key = Buffer.concat([key, digest]);
        prev = digest;
    }
    return key.subarray(0, keyLen);
}

/** HKDF-SHA1 */
export function hkdfSha1(secret: Buffer, salt: Buffer, info: string, length: number): Buffer {
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

/** Increment Nonce (Little Endian) */
export function incrementNonce(nonce: Buffer) {
    for (let i = 0; i < nonce.length; i++) {
        nonce[i]++;
        if (nonce[i] !== 0) return;
    }
}

/** Encrypt a chunk using AEAD */
export function encryptChunk(plaintext: Buffer, key: Buffer, nonce: Buffer, algorithm: string, tagLen: number): Buffer {
    const cipher = crypto.createCipheriv(algorithm as any, key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    incrementNonce(nonce);
    return Buffer.concat([ciphertext, tag]);
}

/** Decrypt a chunk using AEAD */
export function decryptChunk(ciphertext: Buffer, key: Buffer, nonce: Buffer, algorithm: string, tagLen: number): Buffer {
    const tag = ciphertext.subarray(ciphertext.length - tagLen);
    const data = ciphertext.subarray(0, ciphertext.length - tagLen);

    const decipher = crypto.createDecipheriv(algorithm as any, key, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    incrementNonce(nonce);
    return plaintext;
}
