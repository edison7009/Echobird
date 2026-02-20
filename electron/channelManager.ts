// channelManager.ts — Channel config manager (~/.cybernexus/config/channels.json)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Channel config interface
export interface ChannelConfig {
    id: number;
    name: string;
    address: string;
    protocol: string;
}

// Default channel count
const DEFAULT_CHANNEL_COUNT = 6;

// CyberNexus user config directory (cross-platform: ~/.cybernexus/)
function getCyberNexusDir(): string {
    return path.join(os.homedir(), '.cybernexus');
}

// Channels config file path
function getChannelsConfigPath(): string {
    return path.join(getCyberNexusDir(), 'config', 'channels.json');
}

// Ensure config directory exists
function ensureConfigDir(): void {
    const configDir = path.join(getCyberNexusDir(), 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}

// Create default empty channel
function createDefaultChannel(id: number): ChannelConfig {
    return { id, name: '', address: '', protocol: 'ws://' };
}

// Load channel config
export function getChannels(): ChannelConfig[] {
    const configPath = getChannelsConfigPath();
    if (!fs.existsSync(configPath)) {
        // First launch, return default 6 empty channels
        return Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, i) => createDefaultChannel(i + 1));
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const channels = JSON.parse(content) as ChannelConfig[];
        if (Array.isArray(channels) && channels.length > 0) {
            return channels;
        }
    } catch (error) {
        console.error('[ChannelManager] Failed to read channels.json:', error);
    }
    return Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, i) => createDefaultChannel(i + 1));
}

// Save channel config
export function saveChannels(channels: ChannelConfig[]): void {
    ensureConfigDir();
    const configPath = getChannelsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(channels, null, 2), 'utf-8');
    console.log('[ChannelManager] Saved channel config, total', channels.length, 'channels');
}
