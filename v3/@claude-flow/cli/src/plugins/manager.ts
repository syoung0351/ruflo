/**
 * Plugin Manager
 * Handles actual plugin installation, persistence, and lifecycle
 * Bridges discovery service with file system persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Validate npm package name to prevent shell injection (S-3)
 */
const VALID_PACKAGE_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[a-z0-9._\-^~>=<]+)?$/;
function validatePackageName(spec: string): void {
  if (!VALID_PACKAGE_RE.test(spec)) {
    throw new Error(`Invalid package name: ${spec}`);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface InstalledPlugin {
  name: string;
  version: string;
  installedAt: string;
  enabled: boolean;
  source: 'npm' | 'local' | 'ipfs';
  path?: string;
  commands?: string[];
  hooks?: string[];
  config?: Record<string, unknown>;
}

export interface MarketplacePlugin {
  name: string;
  displayName: string;
  description: string;
  version: string;
  installSpec: string;
  tags?: string[];
}

export interface MarketplaceSource {
  type: 'github' | 'url';
  uri: string;
  name: string;
  addedAt: string;
  lastFetched?: string;
  plugins: MarketplacePlugin[];
}

export interface InstalledPluginsManifest {
  version: '1.0.0';
  lastUpdated: string;
  plugins: Record<string, InstalledPlugin>;
  marketplaceSources?: MarketplaceSource[];
}

export interface PluginManagerConfig {
  pluginsDir: string;
  manifestPath: string;
}

// ============================================================================
// Plugin Manager
// ============================================================================

/**
 * Manages plugin installation, persistence, and lifecycle.
 *
 * Unlike the simulated version, this actually:
 * - Persists plugins to disk
 * - Downloads from npm
 * - Tracks enabled/disabled state
 * - Loads plugin modules
 * - Manages marketplace sources (GitHub repositories as plugin catalogs)
 */
export class PluginManager {
  private config: PluginManagerConfig;
  private manifest: InstalledPluginsManifest | null = null;

  constructor(baseDir: string = process.cwd()) {
    const pluginsDir = path.join(baseDir, '.claude-flow', 'plugins');
    this.config = {
      pluginsDir,
      manifestPath: path.join(pluginsDir, 'installed.json'),
    };
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  async initialize(): Promise<void> {
    await this.ensureDirectory(this.config.pluginsDir);
    this.manifest = await this.loadManifest();
  }

  private async ensureDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async loadManifest(): Promise<InstalledPluginsManifest> {
    try {
      if (fs.existsSync(this.config.manifestPath)) {
        const content = fs.readFileSync(this.config.manifestPath, 'utf-8');
        return JSON.parse(content) as InstalledPluginsManifest;
      }
    } catch (error) {
      console.warn('[PluginManager] Failed to load manifest, creating new one');
    }

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      plugins: {},
      marketplaceSources: [],
    };
  }

  private async saveManifest(): Promise<void> {
    if (!this.manifest) return;

    this.manifest.lastUpdated = new Date().toISOString();

    await this.ensureDirectory(path.dirname(this.config.manifestPath));
    fs.writeFileSync(
      this.config.manifestPath,
      JSON.stringify(this.manifest, null, 2),
      'utf-8'
    );
  }

  // =========================================================================
  // Marketplace Source Management
  // =========================================================================

  /**
   * Add a GitHub repository as a marketplace plugin source.
   * Attempts to fetch claude-flow-registry.json from the repo root.
   */
  async addMarketplaceSource(
    uri: string
  ): Promise<{ success: boolean; source?: MarketplaceSource; error?: string; pluginCount?: number }> {
    if (!this.manifest) await this.initialize();

    if (!this.manifest!.marketplaceSources) {
      this.manifest!.marketplaceSources = [];
    }

    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(uri)) {
      return {
        success: false,
        error: `Invalid marketplace URI. Expected format: owner/repo (e.g. VoltAgent/awesome-claude-code-subagents)`,
      };
    }

    if (this.manifest!.marketplaceSources.some(s => s.uri === uri)) {
      return { success: false, error: `Marketplace source "${uri}" is already registered` };
    }

    const repoName = uri.split('/')[1] || uri;
    const source: MarketplaceSource = {
      type: 'github',
      uri,
      name: repoName,
      addedAt: new Date().toISOString(),
      plugins: [],
    };

    const catalog = await this.fetchGitHubRegistry(uri);
    if (catalog && Array.isArray(catalog.plugins)) {
      source.plugins = catalog.plugins;
      source.lastFetched = new Date().toISOString();
    }

    this.manifest!.marketplaceSources.push(source);
    await this.saveManifest();

    return { success: true, source, pluginCount: source.plugins.length };
  }

  /**
   * Remove a registered marketplace source by URI or name.
   */
  async removeMarketplaceSource(uri: string): Promise<{ success: boolean; error?: string }> {
    if (!this.manifest) await this.initialize();

    const sources = this.manifest!.marketplaceSources || [];
    const idx = sources.findIndex(s => s.uri === uri || s.name === uri);
    if (idx === -1) {
      return { success: false, error: `Marketplace source "${uri}" is not registered` };
    }

    sources.splice(idx, 1);
    this.manifest!.marketplaceSources = sources;
    await this.saveManifest();

    return { success: true };
  }

  /**
   * List all registered marketplace sources.
   */
  async getMarketplaceSources(): Promise<MarketplaceSource[]> {
    if (!this.manifest) await this.initialize();
    return this.manifest!.marketplaceSources || [];
  }

  /**
   * Resolve a plugin name to an install spec by checking marketplace sources.
   * Returns the installSpec from the first matching source, or the name itself
   * as a fallback (direct npm install).
   */
  async resolveFromMarketplace(
    name: string
  ): Promise<{ installSpec: string; source?: string }> {
    const sources = await this.getMarketplaceSources();
    for (const source of sources) {
      const found = source.plugins.find(
        p => p.name === name || p.installSpec === name || p.name.endsWith(`/${name}`)
      );
      if (found) {
        return { installSpec: found.installSpec, source: source.uri };
      }
    }
    return { installSpec: name };
  }

  /**
   * Fetch claude-flow-registry.json from a GitHub repository (HTTPS, no deps).
   * Returns null if the file doesn't exist or the request fails.
   */
  private fetchGitHubRegistry(
    ownerRepo: string
  ): Promise<{ plugins: MarketplacePlugin[] } | null> {
    const url = `https://raw.githubusercontent.com/${ownerRepo}/main/claude-flow-registry.json`;
    return new Promise(resolve => {
      const req = https.get(url, { timeout: 10000 }, res => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as { plugins: MarketplacePlugin[] });
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  // =========================================================================
  // Installation
  // =========================================================================

  /**
   * Install a plugin from npm
   */
  async installFromNpm(
    packageName: string,
    version?: string
  ): Promise<{ success: boolean; error?: string; plugin?: InstalledPlugin }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const versionSpec = version ? `${packageName}@${version}` : packageName;

    try {
      // Check if already installed
      if (this.manifest!.plugins[packageName]) {
        return {
          success: false,
          error: `Plugin ${packageName} is already installed. Use upgrade to update.`,
        };
      }

      // Install to local plugins directory
      const installDir = path.join(this.config.pluginsDir, 'node_modules');
      await this.ensureDirectory(installDir);

      // Validate package name to prevent injection (S-3)
      validatePackageName(versionSpec);

      // Use npm to install (array form prevents shell injection)
      console.log(`[PluginManager] Installing ${versionSpec}...`);

      await execFileAsync(
        'npm', ['install', '--prefix', this.config.pluginsDir, versionSpec],
        { timeout: 120000 }
      );

      // Get installed version
      const packageJsonPath = path.join(installDir, packageName, 'package.json');
      let installedVersion = version || 'latest';
      let commands: string[] = [];
      let hooks: string[] = [];

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        installedVersion = pkg.version;

        // Check for claude-flow plugin metadata
        if (pkg['claude-flow']) {
          commands = pkg['claude-flow'].commands || [];
          hooks = pkg['claude-flow'].hooks || [];
        }
      }

      // Create plugin entry
      const plugin: InstalledPlugin = {
        name: packageName,
        version: installedVersion,
        installedAt: new Date().toISOString(),
        enabled: true,
        source: 'npm',
        path: path.join(installDir, packageName),
        commands,
        hooks,
      };

      // Save to manifest
      this.manifest!.plugins[packageName] = plugin;
      await this.saveManifest();

      console.log(`[PluginManager] Installed ${packageName}@${installedVersion}`);

      return { success: true, plugin };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[PluginManager] Failed to install ${packageName}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install a plugin from a local path
   */
  async installFromLocal(
    sourcePath: string
  ): Promise<{ success: boolean; error?: string; plugin?: InstalledPlugin }> {
    if (!this.manifest) {
      await this.initialize();
    }

    try {
      const absolutePath = path.resolve(sourcePath);

      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: `Path does not exist: ${absolutePath}` };
      }

      // Read package.json
      const packageJsonPath = path.join(absolutePath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return { success: false, error: 'No package.json found at path' };
      }

      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const packageName = pkg.name;

      // Check if already installed
      if (this.manifest!.plugins[packageName]) {
        return {
          success: false,
          error: `Plugin ${packageName} is already installed`,
        };
      }

      // Create plugin entry (link to local path, don't copy)
      const plugin: InstalledPlugin = {
        name: packageName,
        version: pkg.version,
        installedAt: new Date().toISOString(),
        enabled: true,
        source: 'local',
        path: absolutePath,
        commands: pkg['claude-flow']?.commands || [],
        hooks: pkg['claude-flow']?.hooks || [],
      };

      // Save to manifest
      this.manifest!.plugins[packageName] = plugin;
      await this.saveManifest();

      console.log(`[PluginManager] Installed local plugin ${packageName}@${pkg.version}`);

      return { success: true, plugin };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[PluginManager] Failed to install from local:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // =========================================================================
  // Uninstallation
  // =========================================================================

  /**
   * Uninstall a plugin
   */
  async uninstall(
    packageName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const plugin = this.manifest!.plugins[packageName];
    if (!plugin) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    try {
      // For npm-installed plugins, remove from node_modules
      if (plugin.source === 'npm') {
        validatePackageName(packageName);
        await execFileAsync(
          'npm', ['uninstall', '--prefix', this.config.pluginsDir, packageName],
          { timeout: 60000 }
        );
      }

      // Remove from manifest
      delete this.manifest!.plugins[packageName];
      await this.saveManifest();

      console.log(`[PluginManager] Uninstalled ${packageName}`);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[PluginManager] Failed to uninstall ${packageName}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // =========================================================================
  // Enable/Disable
  // =========================================================================

  /**
   * Enable a plugin
   */
  async enable(packageName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const plugin = this.manifest!.plugins[packageName];
    if (!plugin) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    // HIGH-04: Warn about unsandboxed plugin execution
    console.warn(`[SECURITY] Plugin loaded without sandboxing: ${packageName}. Plugins run with full process access.`);

    plugin.enabled = true;
    await this.saveManifest();

    return { success: true };
  }

  /**
   * Disable a plugin
   */
  async disable(packageName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const plugin = this.manifest!.plugins[packageName];
    if (!plugin) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    plugin.enabled = false;
    await this.saveManifest();

    return { success: true };
  }

  /**
   * Toggle a plugin's enabled state
   */
  async toggle(packageName: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const plugin = this.manifest!.plugins[packageName];
    if (!plugin) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    plugin.enabled = !plugin.enabled;
    await this.saveManifest();

    return { success: true, enabled: plugin.enabled };
  }

  // =========================================================================
  // Query
  // =========================================================================

  /**
   * Get all installed plugins
   */
  async getInstalled(): Promise<InstalledPlugin[]> {
    if (!this.manifest) {
      await this.initialize();
    }

    return Object.values(this.manifest!.plugins);
  }

  /**
   * Get enabled plugins
   */
  async getEnabled(): Promise<InstalledPlugin[]> {
    const all = await this.getInstalled();
    return all.filter(p => p.enabled);
  }

  /**
   * Check if a plugin is installed
   */
  async isInstalled(packageName: string): Promise<boolean> {
    if (!this.manifest) {
      await this.initialize();
    }

    return packageName in this.manifest!.plugins;
  }

  /**
   * Get a specific installed plugin
   */
  async getPlugin(packageName: string): Promise<InstalledPlugin | undefined> {
    if (!this.manifest) {
      await this.initialize();
    }

    return this.manifest!.plugins[packageName];
  }

  // =========================================================================
  // Upgrade
  // =========================================================================

  /**
   * Upgrade a plugin to a new version
   */
  async upgrade(
    packageName: string,
    version?: string
  ): Promise<{ success: boolean; error?: string; plugin?: InstalledPlugin }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const existing = this.manifest!.plugins[packageName];
    if (!existing) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    if (existing.source !== 'npm') {
      return { success: false, error: 'Can only upgrade npm-installed plugins' };
    }

    try {
      const versionSpec = version ? `${packageName}@${version}` : `${packageName}@latest`;

      // Validate package name to prevent injection (S-3)
      validatePackageName(versionSpec);

      // Reinstall with new version (array form prevents shell injection)
      await execFileAsync(
        'npm', ['install', '--prefix', this.config.pluginsDir, versionSpec],
        { timeout: 120000 }
      );

      // Update manifest
      const installDir = path.join(this.config.pluginsDir, 'node_modules');
      const packageJsonPath = path.join(installDir, packageName, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        existing.version = pkg.version;
        existing.commands = pkg['claude-flow']?.commands || existing.commands;
        existing.hooks = pkg['claude-flow']?.hooks || existing.hooks;
      }

      await this.saveManifest();

      console.log(`[PluginManager] Upgraded ${packageName} to ${existing.version}`);

      return { success: true, plugin: existing };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  // =========================================================================
  // Config
  // =========================================================================

  /**
   * Update plugin config
   */
  async setConfig(
    packageName: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.manifest) {
      await this.initialize();
    }

    const plugin = this.manifest!.plugins[packageName];
    if (!plugin) {
      return { success: false, error: `Plugin ${packageName} is not installed` };
    }

    plugin.config = { ...plugin.config, ...config };
    await this.saveManifest();

    return { success: true };
  }

  /**
   * Get plugins directory path
   */
  getPluginsDir(): string {
    return this.config.pluginsDir;
  }

  /**
   * Get manifest path
   */
  getManifestPath(): string {
    return this.config.manifestPath;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: PluginManager | null = null;

export function getPluginManager(baseDir?: string): PluginManager {
  if (!defaultManager) {
    defaultManager = new PluginManager(baseDir);
  } else if (baseDir && defaultManager.getPluginsDir() !== path.join(baseDir, '.claude-flow', 'plugins')) {
    console.warn(`[PluginManager] Warning: getPluginManager called with different baseDir. Using existing instance. Call resetPluginManager() first to change.`);
  }
  return defaultManager;
}

export function resetPluginManager(): void {
  defaultManager = null;
}
