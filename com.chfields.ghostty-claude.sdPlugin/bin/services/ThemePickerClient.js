"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemePickerClient = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const os = __importStar(require("os"));
class ThemePickerClient {
    constructor() {
        this.cachedPort = null;
        this.lastPortCheck = 0;
        this.portCheckInterval = 5000; // Check port file every 5 seconds
        this.portFilePath = path.join(os.homedir(), '.ghostty-api-port');
    }
    /**
     * Get the API port from the port file
     */
    async getPort() {
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
        }
        catch {
            this.cachedPort = null;
            return null;
        }
    }
    /**
     * Make an HTTP request to the API
     */
    request(method, path) {
        return new Promise(async (resolve, reject) => {
            const port = await this.getPort();
            if (!port) {
                reject(new Error('GhosttyThemePicker not running (no port file)'));
                return;
            }
            const options = {
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
                            resolve(JSON.parse(data));
                        }
                        catch {
                            reject(new Error('Invalid JSON response'));
                        }
                    }
                    else {
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
    async isAvailable() {
        try {
            await this.health();
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get health status
     */
    async health() {
        return this.request('GET', '/api/health');
    }
    /**
     * Get all Ghostty windows with their Claude states
     */
    async getWindows() {
        const response = await this.request('GET', '/api/windows');
        return response.windows;
    }
    /**
     * Focus a specific window
     */
    async focusWindow(windowId) {
        await this.request('POST', `/api/windows/${windowId}/focus`);
    }
    /**
     * Launch a new Ghostty window with a random theme
     */
    async launchRandom() {
        return this.request('POST', '/api/launch-random');
    }
    /**
     * Get all configured workstreams
     */
    async getWorkstreams() {
        const response = await this.request('GET', '/api/workstreams');
        return response.workstreams;
    }
    /**
     * Launch a workstream by ID
     */
    async launchWorkstream(id) {
        return this.request('POST', `/api/workstreams/${id}/launch`);
    }
    /**
     * Open the Quick Launch panel on the Mac
     */
    async openQuickLaunch() {
        await this.request('POST', '/api/quick-launch');
    }
}
exports.ThemePickerClient = ThemePickerClient;
//# sourceMappingURL=ThemePickerClient.js.map