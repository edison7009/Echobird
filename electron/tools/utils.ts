
import * as path from 'path';
import * as os from 'os';

/** Expand environment variables and ~ in paths */
export function expandPath(inputPath: string): string {
    let result = inputPath;
    if (process.platform === 'win32') {
        result = result.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
    }
    if (result.startsWith('~/') || result === '~') {
        result = path.join(os.homedir(), result.slice(1));
    }
    // Normalize separators
    return path.normalize(result);
}

/** Read a nested value from an object by dot-separated path */
export function getNestedValue(obj: any, dotPath: string): any {
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

/** Set a nested value in an object (auto-creates intermediate objects) */
export function setNestedValue(obj: any, dotPath: string, value: any): void {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

/** Delete a nested value from an object */
export function deleteNestedValue(obj: any, dotPath: string): void {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current == null || typeof current !== 'object') return;
        current = current[parts[i]];
    }
    if (current != null && typeof current === 'object') {
        delete current[parts[parts.length - 1]];
    }
}
