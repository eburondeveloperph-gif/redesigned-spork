// js/utils/memory.js

import { CONFIG } from "../config/config.js";

const MEMO_BASE_URL = CONFIG.MEMORY.BASE_URL;

/**
 * Search stored memories based on a query and user ID.
 * @param {string} query - The search query (e.g. the current user message).
 * @param {string} [userId='default'] - The user identifier.
 * @returns {Promise<Array>} - A promise that resolves to an array of memory entries.
 */
async function searchMemory(query, userId = 'default', timeoutMs = 200) {
  if (!MEMO_BASE_URL) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${MEMO_BASE_URL}/search?q=${encodeURIComponent(query)}&user_id=${encodeURIComponent(userId)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Memory search error: ${response.statusText}`);
    }
    const memories = await response.json();
    return memories;
  } catch (error) {
    console.error('Memory search failed:', error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Save new conversation messages to the memory service.
 * @param {string} userId - The user identifier.
 * @param {Array} messages - Array of message objects (e.g. [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]).
 * @returns {Promise<Object|null>} - A promise that resolves to the result of the memory add operation.
 */
async function addMemory(userId, messages) {
  if (!MEMO_BASE_URL) return null;

  try {
    const url = `${MEMO_BASE_URL}/add`;
    const payload = { user_id: userId, messages };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Memory add error: ${response.statusText}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Memory add failed:', error);
    return null;
  }
}

export { searchMemory, addMemory };
