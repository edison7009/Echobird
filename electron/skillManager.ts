/**
 * Skill Manager - Skill Management Module
 * Dynamically fetch skills from GitHub, locally maintain category mapping
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Skill info type
export interface SkillInfo {
    id: string;
    name: string;
    author: string;        // GitHub repo path, e.g. "anthropics/skills"
    category: string;
    installed: boolean;
    brief?: string;        // Short one-line description
    description?: string;
}

// Skills mapping config type
interface SkillsMapping {
    sources: { id: string; name: string; repo: string; path: string }[];
    categoryMapping: Record<string, string>;
    defaultCategory: string;
    briefOverrides: Record<string, string>;
}

// Get skills installation directory (Cross-platform)
function getSkillsDirectory(): string {
    const homeDir = os.homedir();
    const agentsDir = path.join(homeDir, '.agents', 'skills');
    const agentDir = path.join(homeDir, '.agent', 'skills');
    const claudeDir = path.join(homeDir, '.claude', 'skills');

    if (fs.existsSync(agentsDir)) return agentsDir;
    if (fs.existsSync(agentDir)) return agentDir;
    if (fs.existsSync(claudeDir)) return claudeDir;

    return agentsDir;
}

// Load category mapping from local config
function loadSkillsMapping(): SkillsMapping {
    try {
        const mappingPath = path.join(__dirname, 'config', 'skillsMapping.json');
        const mappingData = fs.readFileSync(mappingPath, 'utf-8');
        return JSON.parse(mappingData);
    } catch (error) {
        console.error('[SkillManager] Failed to load skillsMapping.json:', error);
        return {
            sources: [{ id: 'anthropics', name: 'Anthropics Official', repo: 'anthropics/skills', path: 'skills' }],
            categoryMapping: {},
            defaultCategory: 'Other',
            briefOverrides: {}
        };
    }
}

// Cache for fetched skills
let cachedSkills: Omit<SkillInfo, 'installed'>[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch skills from GitHub API
async function fetchSkillsFromGitHub(): Promise<Omit<SkillInfo, 'installed'>[]> {
    const mapping = loadSkillsMapping();
    const allSkills: Omit<SkillInfo, 'installed'>[] = [];

    for (const source of mapping.sources) {
        try {
            const url = `https://api.github.com/repos/${source.repo}/contents/${source.path}`;
            console.log(`[SkillManager] Fetching from ${url}`);

            const response = await fetch(url);
            if (!response.ok) {
                console.error(`[SkillManager] GitHub API error: ${response.status}`);
                continue;
            }

            const items = await response.json() as Array<{ name: string; type: string }>;

            for (const item of items) {
                if (item.type === 'dir') {
                    const skillId = item.name;
                    const category = mapping.categoryMapping[skillId] || mapping.defaultCategory;
                    const brief = mapping.briefOverrides[skillId] || `Skill from ${source.name}`;

                    allSkills.push({
                        id: skillId,
                        name: skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                        author: source.repo,
                        category,
                        brief
                    });
                }
            }
        } catch (error) {
            console.error(`[SkillManager] Failed to fetch from ${source.repo}:`, error);
        }
    }

    return allSkills;
}

// Load skills with caching
async function loadSkillsCatalog(): Promise<Omit<SkillInfo, 'installed'>[]> {
    const now = Date.now();

    // Return cached if still valid
    if (cachedSkills.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
        return cachedSkills;
    }

    // Try to fetch from GitHub
    const freshSkills = await fetchSkillsFromGitHub();

    if (freshSkills.length > 0) {
        cachedSkills = freshSkills;
        lastFetchTime = now;
        console.log(`[SkillManager] Fetched ${freshSkills.length} skills from GitHub`);
        return cachedSkills;
    }

    // Fallback to local cache file if exists
    try {
        const cachePath = path.join(__dirname, 'config', 'skills.json');
        if (fs.existsSync(cachePath)) {
            const cacheData = fs.readFileSync(cachePath, 'utf-8');
            cachedSkills = JSON.parse(cacheData);
            console.log(`[SkillManager] Using cached skills.json (${cachedSkills.length} skills)`);
            return cachedSkills;
        }
    } catch (error) {
        console.error('[SkillManager] Failed to load fallback cache:', error);
    }

    return [];
}

// Initialize skills catalog (async)
let skillsCatalogPromise: Promise<Omit<SkillInfo, 'installed'>[]> | null = null;

function getSkillsCatalog(): Promise<Omit<SkillInfo, 'installed'>[]> {
    if (!skillsCatalogPromise) {
        skillsCatalogPromise = loadSkillsCatalog();
    }
    return skillsCatalogPromise;
}

// Force refresh skills from GitHub
export async function refreshSkillsCatalog(): Promise<number> {
    lastFetchTime = 0;
    skillsCatalogPromise = null;
    const skills = await getSkillsCatalog();
    return skills.length;
}

/**
 * Get installed skill ID list
 */
export function getInstalledSkillIds(): string[] {
    const skillsDir = getSkillsDirectory();

    if (!fs.existsSync(skillsDir)) {
        return [];
    }

    try {
        // Read directory names in skills directory
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() || entry.name.endsWith('.md'))
            .map(entry => entry.name.replace('.md', ''));
    } catch (error) {
        console.error('Failed to read skills directory:', error);
        return [];
    }
}

// Installed skill info
export interface InstalledSkillInfo {
    id: string;
    name: string;
    path: string;
    hasReadme: boolean;
    description?: string;
}

/**
 * Get installed skills list for a specific tool directory
 */
export function getToolInstalledSkills(skillsPath: string): InstalledSkillInfo[] {
    console.log(`[SkillManager] Reading skills from: ${skillsPath}`);

    if (!skillsPath || !fs.existsSync(skillsPath)) {
        console.log(`[SkillManager] Skills path not found: ${skillsPath}`);
        return [];
    }

    try {
        const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
        const skills: InstalledSkillInfo[] = [];

        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const skillDir = path.join(skillsPath, entry.name);
                const readmePath = path.join(skillDir, 'SKILL.md');
                const altReadmePath = path.join(skillDir, 'README.md');

                let description = '';
                let hasReadme = false;

                // Try reading first line of SKILL.md or README.md as description
                if (fs.existsSync(readmePath)) {
                    hasReadme = true;
                    try {
                        const content = fs.readFileSync(readmePath, 'utf-8');
                        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
                        if (lines.length > 0) {
                            description = lines[0].slice(0, 100);
                        }
                    } catch { }
                } else if (fs.existsSync(altReadmePath)) {
                    hasReadme = true;
                    try {
                        const content = fs.readFileSync(altReadmePath, 'utf-8');
                        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                        if (lines.length > 0) {
                            description = lines[0].slice(0, 100);
                        }
                    } catch { }
                }

                skills.push({
                    id: entry.name,
                    name: entry.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    path: skillDir,
                    hasReadme,
                    description
                });
            }
        }

        console.log(`[SkillManager] Found ${skills.length} installed skills`);
        return skills;
    } catch (error) {
        console.error('[SkillManager] Failed to read skills directory:', error);
        return [];
    }
}

/**
 * Get full skills list (including installation status)
 */
export async function getSkillsList(): Promise<SkillInfo[]> {
    const installedIds = getInstalledSkillIds();
    const catalog = await getSkillsCatalog();

    return catalog.map((skill: Omit<SkillInfo, 'installed'>) => ({
        ...skill,
        installed: installedIds.includes(skill.id)
    }));
}

/**
 * Get skills by category
 */
export async function getSkillsByCategory(category: string): Promise<SkillInfo[]> {
    const allSkills = await getSkillsList();
    if (category === 'All') return allSkills;
    return allSkills.filter((s: SkillInfo) => s.category === category);
}

/**
 * Get all categories
 */
export function getSkillCategories(): string[] {
    return ['All', 'Development', 'Marketing', 'Design', 'Research', 'AI/ML', 'Finance'];
}

/**
 * Get install command for a skill (returns command string for user to run manually)
 */
export async function getSkillInstallCommand(skillId: string): Promise<{ command: string; success: boolean; message: string }> {
    const catalog = await getSkillsCatalog();
    const skill = catalog.find((s: Omit<SkillInfo, 'installed'>) => s.id === skillId);
    if (!skill) {
        return { command: '', success: false, message: `Skill ${skillId} not found` };
    }

    const repoUrl = `https://github.com/${skill.author}`;
    const command = `npx skills add ${repoUrl} --skill ${skillId}`;

    console.log(`[SkillManager] Generated install command: ${command}`);

    return {
        command,
        success: true,
        message: `Command ready: ${command}`
    };
}

/**
 * Install skill - returns command for frontend to copy to clipboard
 */
export async function installSkill(skillId: string): Promise<{ success: boolean; message: string; command?: string }> {
    const result = await getSkillInstallCommand(skillId);
    return {
        success: result.success,
        message: result.message,
        command: result.command
    };
}

/**
 * Uninstall skill
 */
export function uninstallSkill(skillId: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
        const skillsDir = getSkillsDirectory();
        const skillPath = path.join(skillsDir, skillId);
        const skillMdPath = path.join(skillsDir, `${skillId}.md`);

        try {
            // Try to remove directory
            if (fs.existsSync(skillPath)) {
                fs.rmSync(skillPath, { recursive: true });
            }
            // Try to remove .md file
            if (fs.existsSync(skillMdPath)) {
                fs.unlinkSync(skillMdPath);
            }

            resolve({ success: true, message: `Skill ${skillId} uninstalled` });
        } catch (error) {
            console.error('Uninstall failed:', error);
            resolve({
                success: false,
                message: `Uninstall failed: ${error}`
            });
        }
    });
}

/**
 * Search skills
 */
export async function searchSkills(query: string): Promise<SkillInfo[]> {
    const allSkills = await getSkillsList();
    const lowerQuery = query.toLowerCase();

    return allSkills.filter((skill: SkillInfo) =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.author.toLowerCase().includes(lowerQuery) ||
        skill.category.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Get skill details from GitHub SKILL.md
 */
export async function getSkillDetails(skillId: string): Promise<{ description: string; readme?: string }> {
    const catalog = await getSkillsCatalog();
    const skill = catalog.find((s: Omit<SkillInfo, 'installed'>) => s.id === skillId);

    return new Promise((resolve) => {
        if (!skill) {
            resolve({ description: 'Skill not found' });
            return;
        }

        // Try multiple possible URLs
        const urls = [
            // Pattern 1: skills subdirectory (most common)
            `https://raw.githubusercontent.com/${skill.author}/main/skills/${skillId}/SKILL.md`,
            // Pattern 2: direct skillId folder
            `https://raw.githubusercontent.com/${skill.author}/main/${skillId}/SKILL.md`,
            // Pattern 3: skills subdirectory with README
            `https://raw.githubusercontent.com/${skill.author}/main/skills/${skillId}/README.md`,
            // Pattern 4: direct with README
            `https://raw.githubusercontent.com/${skill.author}/main/${skillId}/README.md`,
        ];

        const tryFetch = (index: number): void => {
            if (index >= urls.length) {
                resolve({ description: 'No description available. Visit GitHub for details.' });
                return;
            }

            console.log(`[SkillManager] Trying: ${urls[index]}`);

            fetch(urls[index])
                .then(res => {
                    if (res.ok) return res.text();
                    throw new Error('Not found');
                })
                .then(text => {
                    // Extract first paragraph or first 500 chars
                    const cleanText = text
                        .replace(/^---[\s\S]*?---\n*/m, '') // Remove YAML frontmatter
                        .replace(/^#[^\n]*\n*/gm, '')       // Remove headings
                        .trim()
                        .slice(0, 500);

                    resolve({
                        description: cleanText || 'No description available',
                        readme: text
                    });
                })
                .catch(() => {
                    tryFetch(index + 1);
                });
        };

        tryFetch(0);
    });
}
