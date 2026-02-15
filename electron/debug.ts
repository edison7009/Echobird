/**
 * Debug Script - Directly test tool detection logic
 * Run: npx ts-node electron/debug.ts
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const HOME = os.homedir();

console.log('='.repeat(60));
console.log('WhichClaw Tool Detection Debug');
console.log('='.repeat(60));
console.log(`Operating System: ${os.platform()}`);
console.log(`User Directory: ${HOME}`);
console.log('='.repeat(60));

// Test where command
async function testWhereCommand(cmd: string) {
    console.log(`\nTesting Command: ${cmd}`);
    console.log('-'.repeat(40));

    try {
        // Method 1: Direct where
        console.log('Method 1: where ' + cmd);
        const result1 = await execAsync(`where ${cmd}`, { timeout: 5000 });
        console.log('✅ Success:', result1.stdout.trim());
    } catch (e: any) {
        console.log('❌ Failed:', e.message?.split('\n')[0]);
    }

    try {
        // Method 2: cmd /c where
        console.log('Method 2: cmd /c "where ' + cmd + '"');
        const result2 = await execAsync(`cmd /c "where ${cmd}"`, { timeout: 5000 });
        console.log('✅ Success:', result2.stdout.trim().split('\n')[0]);
    } catch (e: any) {
        console.log('❌ Failed:', e.message?.split('\n')[0]);
    }

    try {
        // Method 3: --version
        console.log('Method 3: ' + cmd + ' --version');
        const result3 = await execAsync(`${cmd} --version`, { timeout: 5000 });
        console.log('✅ Success:', result3.stdout.trim().split('\n')[0]);
    } catch (e: any) {
        console.log('❌ Failed:', e.message?.split('\n')[0]);
    }
}

// Test if directory exists
function testDirectory(name: string, dirPath: string) {
    console.log(`\nChecking Directory: ${name}`);
    console.log(`Path: ${dirPath}`);
    try {
        fs.accessSync(dirPath);
        console.log('✅ Exists');

        // List contents
        const files = fs.readdirSync(dirPath);
        console.log(`Contents: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    } catch {
        console.log('❌ Not Found');
    }
}

async function main() {
    // Test command detection
    await testWhereCommand('claude');
    await testWhereCommand('openclaw');
    await testWhereCommand('opencode');
    await testWhereCommand('codex');

    console.log('\n' + '='.repeat(60));
    console.log('Directory Detection');
    console.log('='.repeat(60));

    // Test directory
    testDirectory('Claude Config', path.join(HOME, '.claude'));
    testDirectory('OpenClaw Config', path.join(HOME, '.openclaw'));
    testDirectory('OpenCode Config', path.join(HOME, '.opencode'));
    testDirectory('Codex Config', path.join(HOME, '.codex'));

    console.log('\n' + '='.repeat(60));
    console.log('Debug Complete');
    console.log('='.repeat(60));
}

main().catch(console.error);
