import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';

// Types matching the API responses
export interface GhosttyWindow {
  id: string;
  pid: number;
  axIndex: number;
  title: string;
  claudeState: 'asking' | 'waiting' | 'working' | 'running' | 'notRunning';
  displayName: string;
  workstreamName: string | null;
  hasClaudeProcess: boolean;
}

export interface WindowsResponse {
  windows: GhosttyWindow[];
}

export interface HealthResponse {
  status: string;
  version: string;
}

export class ThemePickerClient {
  private portFilePath: string;
  private cachedPort: number | null = null;
  private lastPortCheck: number = 0;
  private portCheckInterval = 5000; // Check port file every 5 seconds

  constructor() {
    this.portFilePath = path.join(os.homedir(), '.ghostty-api-port');
  }

  /**
   * Get the API port from the port file
   */
  private async getPort(): Promise<number | null> {
    const now = Date.now();

    // Use cached port if recent enough
    if (this.cachedPort && now - this.lastPortCheck < this.portCheckInterval) {
      return this.cachedPort;
    }

    try {
      if (!fs.existsSync(this.portFilePath)) {
        this.cachedPort = null;
        return null;
      }

      const content = fs.readFileSync(this.portFilePath, 'utf-8').trim();
      const port = parseInt(content, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        this.cachedPort = null;
        return null;
      }

      this.cachedPort = port;
      this.lastPortCheck = now;
      return port;
    } catch {
      this.cachedPort = null;
      return null;
    }
  }

  /**
   * Make an HTTP request to the API
   */
  private request<T>(method: string, path: string): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const port = await this.getPort();

      if (!port) {
        reject(new Error('GhosttyThemePicker not running (no port file)'));
        return;
      }

      const options: http.RequestOptions = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        // Clear cached port on connection error (server may have restarted)
        this.cachedPort = null;
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Check if GhosttyThemePicker is running and responding
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get health status
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/api/health');
  }

  /**
   * Get all Ghostty windows with their Claude states
   */
  async getWindows(): Promise<GhosttyWindow[]> {
    const response = await this.request<WindowsResponse>('GET', '/api/windows');
    return response.windows;
  }

  /**
   * Focus a specific window
   */
  async focusWindow(windowId: string): Promise<void> {
    await this.request<{ success: boolean }>('POST', `/api/windows/${windowId}/focus`);
  }
}
