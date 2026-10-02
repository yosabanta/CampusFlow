/**
 * CampusFlow MVP — Centralized Resilient API Client
 * Handles GET, POST, PATCH, JWT Headers, 401 Auto-Recovery, Validation Errors
 */

import { store } from "./state.js";

const DEFAULT_BASE_URL = window.BACKEND_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url) {
    this.baseUrl = url;
  }

  getHeaders(customHeaders = {}) {
    const headers = {
      "Accept": "application/json",
      ...customHeaders
    };

    const token = store.getState().token;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    const method = options.method || "GET";
    const headers = this.getHeaders(options.headers);

    if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    // Abort controller with timeout for low-bandwidth resilience
    const controller = new AbortController();
    const timeoutMs = options.timeout || 12000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle 401 Unauthorized globally
      if (response.status === 401) {
        // Clear authenticated session if token expired or invalid
        if (store.getState().token) {
          store.setState({ token: null, user: null, role: null });
          window.location.hash = "#login";
        }
        const errorData = await this.parseJsonSafe(response);
        throw new ApiError(errorData?.detail || errorData?.error?.message || "Session expired or invalid credentials. Please log in.", 401, errorData);
      }

      // Handle 403 Forbidden
      if (response.status === 403) {
        const errorData = await this.parseJsonSafe(response);
        throw new ApiError(errorData?.detail || errorData?.error?.message || "Access forbidden. Your role is not authorized for this operation.", 403, errorData);
      }

      // Handle 422 Validation Error
      if (response.status === 422) {
        const errorData = await this.parseJsonSafe(response);
        let msg = "Validation failed.";
        if (errorData?.error?.details && Array.isArray(errorData.error.details)) {
          msg = errorData.error.details.map(d => `${d.field}: ${d.message}`).join(", ");
        } else if (Array.isArray(errorData?.detail)) {
          msg = errorData.detail.map(d => `${d.loc ? d.loc.join('.') : ''}: ${d.msg}`).join(", ");
        } else if (errorData?.detail) {
          msg = errorData.detail;
        }
        throw new ApiError(msg, 422, errorData);
      }

      // Handle generic HTTP errors
      if (!response.ok) {
        const errorData = await this.parseJsonSafe(response);
        const msg = errorData?.detail || errorData?.error?.message || `HTTP Error ${response.status}: ${response.statusText}`;
        throw new ApiError(msg, response.status, errorData);
      }

      // 204 No Content
      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new ApiError("Request timed out. Please check your network connection.", 408);
      }
      // Network unreachable
      throw new ApiError(err.message || "Failed to connect to CampusFlow server. Verify backend is running.", 0);
    }
  }

  async parseJsonSafe(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: "GET" });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: "POST", body });
  }

  patch(endpoint, body = null, options = {}) {
    return this.request(endpoint, { ...options, method: "PATCH", body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: "DELETE" });
  }
}

export const api = new ApiClient();
