/**
 * MicrosoftEnterpriseMCPClient
 * Low-level HTTP client for Microsoft Enterprise MCP Server
 *
 * Features:
 * - Rate limiting (100 requests/minute)
 * - Token authentication
 * - Request/response caching
 * - Error handling with exponential backoff
 *
 * Reference: https://learn.microsoft.com/en-us/graph/mcp-server/overview
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface MCPClientConfig {
  baseUrl?: string; // Defaults to Microsoft's endpoint
  timeout?: number; // Request timeout in ms (default 30s)
  maxRetries?: number; // Max retry attempts (default 3)
  enableCache?: boolean; // Enable response caching (default true)
}

export interface MCPRequestOptions {
  skipCache?: boolean; // Skip cache for this request
  priority?: 'high' | 'normal' | 'low'; // Request priority for rate limiting
}

export interface MCPResponse<T = any> {
  data: T;
  cached?: boolean;
  requestId?: string;
  timestamp: number;
}

export interface RateLimitStatus {
  requestsThisMinute: number;
  maxRequestsPerMinute: number;
  resetTime: Date;
  warningThreshold: number; // 80% of max
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

interface RequestQueueItem {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

export class MicrosoftEnterpriseMCPClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly enableCache: boolean;
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;

  // Rate limiting
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute = 100;
  private readonly warningThreshold = 80; // 80% of max
  private requestQueue: RequestQueueItem[] = [];
  private isProcessingQueue = false;

  // Caching
  private cache: Map<string, CacheEntry> = new Map();
  private readonly defaultCacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: MCPClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://mcp.svc.cloud.microsoft/enterprise';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.enableCache = config.enableCache !== false;

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EntraPulseLite/1.1.0'
      }
    });

    // Setup request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Setup response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log('[MicrosoftEnterpriseMCPClient] Response received:', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        console.error('[MicrosoftEnterpriseMCPClient] Request failed:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set access token for authentication
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    console.log('[MicrosoftEnterpriseMCPClient] Access token updated');
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    this.cleanupOldTimestamps();

    const now = Date.now();
    const resetTime = new Date(now + 60000); // Next minute

    return {
      requestsThisMinute: this.requestTimestamps.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      resetTime,
      warningThreshold: this.warningThreshold
    };
  }

  /**
   * Check if rate limit warning threshold is reached
   */
  isRateLimitWarning(): boolean {
    const status = this.getRateLimitStatus();
    return status.requestsThisMinute >= status.warningThreshold;
  }

  /**
   * Check if rate limit is exceeded
   */
  isRateLimitExceeded(): boolean {
    const status = this.getRateLimitStatus();
    return status.requestsThisMinute >= status.maxRequestsPerMinute;
  }

  /**
   * Remove timestamps older than 1 minute
   */
  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  /**
   * Add request timestamp for rate limiting
   */
  private trackRequest(): void {
    this.requestTimestamps.push(Date.now());
    this.cleanupOldTimestamps();
  }

  /**
   * Wait until rate limit allows request
   */
  private async waitForRateLimit(): Promise<void> {
    while (this.isRateLimitExceeded()) {
      const status = this.getRateLimitStatus();
      const waitTime = status.resetTime.getTime() - Date.now() + 100; // Add 100ms buffer

      console.log('[MicrosoftEnterpriseMCPClient] Rate limit reached, waiting', waitTime, 'ms');
      await new Promise(resolve => setTimeout(resolve, Math.max(0, waitTime)));
      this.cleanupOldTimestamps();
    }
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(url: string, params?: any): string {
    return `${url}:${JSON.stringify(params || {})}`;
  }

  /**
   * Get cached response if available and not expired
   */
  private getFromCache(cacheKey: string): any | null {
    if (!this.enableCache) {
      return null;
    }

    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired
      this.cache.delete(cacheKey);
      return null;
    }

    console.log('[MicrosoftEnterpriseMCPClient] Cache hit:', cacheKey);
    return entry.data;
  }

  /**
   * Store response in cache
   */
  private storeInCache(cacheKey: string, data: any, ttl: number): void {
    if (!this.enableCache) {
      return;
    }

    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });

    console.log('[MicrosoftEnterpriseMCPClient] Cached response:', cacheKey, 'TTL:', ttl);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[MicrosoftEnterpriseMCPClient] Cache cleared');
  }

  /**
   * Execute request with rate limiting, caching, and retries
   */
  private async executeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    data?: any,
    options: MCPRequestOptions = {}
  ): Promise<MCPResponse<T>> {
    const cacheKey = this.getCacheKey(url, data);

    // Check cache first (unless skipCache is true)
    if (!options.skipCache && method === 'GET') {
      const cachedData = this.getFromCache(cacheKey);
      if (cachedData !== null) {
        return {
          data: cachedData,
          cached: true,
          timestamp: Date.now()
        };
      }
    }

    // Wait for rate limit if needed
    await this.waitForRateLimit();

    // Track this request
    this.trackRequest();

    // Execute request with retries
    let lastError: any;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.request<T>({
          method,
          url,
          data: method === 'POST' ? data : undefined,
          params: method === 'GET' ? data : undefined
        });

        // Cache successful GET responses
        if (method === 'GET' && this.enableCache) {
          const ttl = this.defaultCacheTTL;
          this.storeInCache(cacheKey, response.data, ttl);
        }

        return {
          data: response.data,
          cached: false,
          requestId: response.headers['x-request-id'],
          timestamp: Date.now()
        };
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          // Handle specific status codes
          if (axiosError.response?.status === 401) {
            // Token expired - don't retry
            throw new Error('Authentication failed: Token expired or invalid');
          }

          if (axiosError.response?.status === 403) {
            // Missing consent - don't retry
            throw new Error('Authorization failed: Missing required MCP scopes. Please grant admin consent.');
          }

          if (axiosError.response?.status === 429) {
            // Rate limit hit - wait and retry
            const retryAfter = axiosError.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

            console.log(`[MicrosoftEnterpriseMCPClient] Rate limit (429), waiting ${waitTime}ms before retry ${attempt + 1}/${this.maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          if (axiosError.response?.status && axiosError.response.status >= 500) {
            // Server error - retry with exponential backoff
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[MicrosoftEnterpriseMCPClient] Server error (${axiosError.response.status}), waiting ${waitTime}ms before retry ${attempt + 1}/${this.maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // For other errors, don't retry
        throw error;
      }
    }

    // All retries failed
    throw lastError;
  }

  /**
   * Execute GET request
   */
  async get<T>(url: string, params?: any, options?: MCPRequestOptions): Promise<MCPResponse<T>> {
    return this.executeRequest<T>('GET', url, params, options);
  }

  /**
   * Execute POST request
   */
  async post<T>(url: string, data?: any, options?: MCPRequestOptions): Promise<MCPResponse<T>> {
    return this.executeRequest<T>('POST', url, data, options);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health', undefined, { skipCache: true });
      return true;
    } catch (error) {
      console.error('[MicrosoftEnterpriseMCPClient] Health check failed:', error);
      return false;
    }
  }
}
