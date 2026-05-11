import { MultimodalLiveClient } from "./core/websocket-client.js"
import { AudioStreamer } from "./audio/audio-streamer.js"
import { AudioRecorder } from "./audio/audio-recorder.js"
import { CONFIG } from "./config/config.js"
import { Logger } from "./utils/logger.js"
import { hermesAgent } from "./services/hermes-agent.js"
import { VideoManager } from "./video/video-manager.js"
import { ScreenRecorder } from "./video/screen-recorder.js"
import { searchMemory, addMemory } from "./utils/memory.js" // Import Memo AI functions
import { ApplicationError } from "./utils/error-boundary.js"
import { checkPermissions, GmailService, DriveService, CalendarService, TasksService } from "./google-services.js"

// === Conversation History Management (localStorage) ===
const CONVERSATION_STORAGE_KEY = "eburon_conversation_history"
const SESSIONS_STORAGE_KEY = "eburon_conversation_sessions"
const USER_LEARNING_STORAGE_KEY = "eburon_user_learning"
const MAX_CONVERSATION_HISTORY = 50 // Keep last 50 conversation turns
const MAX_SESSIONS = 20 // Keep last 20 sessions

// Session management
let currentSessionId = null
let currentSession = null

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function createNewSession(title = null) {
  const sessionId = generateSessionId()
  const session = {
    id: sessionId,
    title: title || `Conversation ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    messageCount: 0,
    tags: []
  }
  
  const sessions = getAllSessions()
  sessions.unshift(session)
  
  // Keep only MAX_SESSIONS
  if (sessions.length > MAX_SESSIONS) {
    sessions.pop()
  }
  
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  setCurrentSession(sessionId)
  
  Logger.info(`Created new session: ${sessionId}`)
  return session
}

function getAllSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]")
  } catch (error) {
    Logger.error("Failed to load sessions from localStorage:", error)
    return []
  }
}

function getCurrentSession() {
  if (!currentSessionId) {
    const sessions = getAllSessions()
    if (sessions.length > 0) {
      setCurrentSession(sessions[0].id)
    } else {
      createNewSession()
    }
  }
  
  const sessions = getAllSessions()
  return sessions.find(s => s.id === currentSessionId) || null
}

function setCurrentSession(sessionId) {
  currentSessionId = sessionId
  localStorage.setItem("current_session_id", sessionId)
  const session = getCurrentSession()
  if (session) {
    currentSession = session
  }
}

function updateSession(sessionId, updates) {
  const sessions = getAllSessions()
  const index = sessions.findIndex(s => s.id === sessionId)
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates, updatedAt: Date.now() }
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
    if (currentSessionId === sessionId) {
      currentSession = sessions[index]
    }
  }
}

function deleteSession(sessionId) {
  const sessions = getAllSessions()
  const filtered = sessions.filter(s => s.id !== sessionId)
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(filtered))
  
  if (currentSessionId === sessionId) {
    if (filtered.length > 0) {
      setCurrentSession(filtered[0].id)
    } else {
      createNewSession()
    }
  }
  
  Logger.info(`Deleted session: ${sessionId}`)
}

function saveMessageToSession(role, content, metadata = {}) {
  const session = getCurrentSession()
  if (!session) {
    createNewSession()
    return saveMessageToSession(role, content, metadata)
  }
  
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
    ...metadata
  }
  
  session.messages.push(message)
  session.messageCount = session.messages.length
  session.updatedAt = Date.now()
  
  // Auto-generate title from first user message
  if (session.messageCount === 1 && role === "user") {
    session.title = content.substring(0, 50) + (content.length > 50 ? "..." : "")
  }
  
  updateSession(session.id, {
    messages: session.messages,
    messageCount: session.messageCount,
    title: session.title
  })
  
  // Also save to legacy history for compatibility
  if (role === "user") {
    lastUserMessage = content
  } else if (role === "assistant") {
    lastAssistantMessage = content
    saveConversationToHistory(lastUserMessage, lastAssistantMessage)
  }
  
  // Update user learning
  updateUserLearning(role, content)
  
  return message
}

function loadSessionMessages(sessionId) {
  const sessions = getAllSessions()
  const session = sessions.find(s => s.id === sessionId)
  if (session && session.messages) {
    return session.messages
  }
  return []
}

// User learning system
function getUserLearning() {
  try {
    return JSON.parse(localStorage.getItem(USER_LEARNING_STORAGE_KEY) || '{"patterns":[],"preferences":[],"topics":[]}')
  } catch (error) {
    Logger.error("Failed to load user learning:", error)
    return { patterns: [], preferences: [], topics: [] }
  }
}

function updateUserLearning(role, content) {
  const learning = getUserLearning()
  
  if (role === "user") {
    // Extract topics from user messages
    const words = content.toLowerCase().split(/\s+/)
    const importantWords = words.filter(w => w.length > 4)
    
    importantWords.forEach(word => {
      const existing = learning.topics.find(t => t.word === word)
      if (existing) {
        existing.count++
        existing.lastSeen = Date.now()
      } else {
        learning.topics.push({ word, count: 1, lastSeen: Date.now() })
      }
    })
    
    // Keep only top 50 topics
    learning.topics.sort((a, b) => b.count - a.count)
    learning.topics = learning.topics.slice(0, 50)
    
    localStorage.setItem(USER_LEARNING_STORAGE_KEY, JSON.stringify(learning))
  }
}

function getUserPreferences() {
  const learning = getUserLearning()
  return learning.preferences
}

function getUserTopics() {
  const learning = getUserLearning()
  return learning.topics.slice(0, 10).map(t => t.word)
}

// Legacy conversation history functions (for compatibility)
function saveConversationToHistory(userMessage, assistantMessage) {
  try {
    const history = JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) || "[]")
    history.push({
      user: userMessage,
      assistant: assistantMessage,
      timestamp: Date.now(),
    })
    // Keep only the last MAX_CONVERSATION_HISTORY turns
    if (history.length > MAX_CONVERSATION_HISTORY) {
      history.shift()
    }
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(history))
  } catch (error) {
    Logger.error("Failed to save conversation to localStorage:", error)
  }
}

function getConversationHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) || "[]")
  } catch (error) {
    Logger.error("Failed to load conversation from localStorage:", error)
    return []
  }
}

function clearConversationHistory() {
  try {
    localStorage.removeItem(CONVERSATION_STORAGE_KEY)
  } catch (error) {
    Logger.error("Failed to clear conversation history:", error)
  }
}

function generateOpeningMessageFromHistory() {
  const session = getCurrentSession()
  const learning = getUserLearning()
  const userTopics = getUserTopics()
  
  // If session has messages, reference the last one
  if (session && session.messages.length > 0) {
    const lastMessage = session.messages[session.messages.length - 1]
    if (lastMessage.role === "user") {
      const openingMessages = [
        `Hey Boss! Last time you mentioned "${lastMessage.content.substring(0, 50)}...". How's that going?`,
        `Welcome back, Boss! You were talking about "${lastMessage.content.substring(0, 50)}..." earlier. Any updates?`,
        `Hi Boss! I remember we were discussing "${lastMessage.content.substring(0, 50)}...". Want to continue that?`,
      ]
      return openingMessages[Math.floor(Math.random() * openingMessages.length)]
    }
  }
  
  // If we have learned about user topics, mention them
  if (userTopics.length > 0) {
    const topics = userTopics.slice(0, 3).join(", ")
    const openingMessages = [
      `Hey Boss! I've learned you're interested in ${topics}. Lets start automating your task?`,
      `Welcome back, Boss! Based on our conversations, you seem to care about ${topics}. What's new?`,
      `Hi Boss! Good to see you again. Ready to talk more about ${topics}?`,
    ]
    return openingMessages[Math.floor(Math.random() * openingMessages.length)]
  }
  
  // Default opening
  return "Hey Boss! I'm Beatrice. Lets start automating your task?"
}
import {
  auth,
  db,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  ref,
  get,
  set,
  update,
  firebaseMissingConfigKeys,
  getGoogleAccessTokenFromCredential,
  storeGoogleOAuthAccessToken,
  getStoredGoogleOAuthAccessToken,
  clearStoredGoogleOAuthAccessToken,
} from "./firebase.js"

/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI, audio, video, and WebSocket interactions.
 * Now includes Memo AI integration to persist chat history and use it as long-term memory.
 */

// === DOM Elements ===
const logsContainer = document.getElementById("logs-container")
const messageInput = document.getElementById("message-input")
const sendButton = document.getElementById("send-button")
const micButton = document.getElementById("mic-button")
const micIcon = document.getElementById("mic-icon")
const audioVisualizer = document.getElementById("audio-visualizer")
const connectButton = document.getElementById("connect-button")
const cameraButton = document.getElementById("camera-button")
const cameraIcon = document.getElementById("camera-icon")
const flipCameraButton = document.getElementById("flip-camera-button")
const stopVideoButton = document.getElementById("stop-video")
const screenButton = document.getElementById("screen-button")
const screenIcon = document.getElementById("screen-icon")
const screenContainer = document.getElementById("screen-container")
const screenPreview = document.getElementById("screen-preview")
const videoContainer = document.getElementById("video-container")
const textStreamingArea = document.getElementById("text-streaming-area")
const conversationContainer = document.getElementById("conversation-container")
const inputAudioVisualizer = document.getElementById("input-audio-visualizer")
const micVisualizer = document.getElementById("mic-visualizer")
const appContainer = document.getElementById("app")
const attachButton = document.getElementById("attach-button")
const attachInput = document.getElementById("attach-input")
const attachmentChips = document.getElementById("attachment-chips")
const voiceSelect = document.getElementById("voice-select")
const sampleRateInput = document.getElementById("sample-rate-input")
const systemInstructionInput = document.getElementById("system-instruction")
const applyConfigButton = document.getElementById("apply-config")
const configToggle = document.getElementById("config-toggle")
const toggleLogs = document.getElementById("toggle-logs")
const logsWrapper = document.querySelector(".logs-wrapper")
const configContainer = document.getElementById("config-container")

// === Theme Switcher ===
const themeToggle = document.getElementById("theme-toggle")
const root = document.documentElement
const savedTheme = localStorage.getItem("theme") || "dark"
root.setAttribute("data-theme", savedTheme)
// No need to change text content anymore since we're using CSS to show the icon

themeToggle?.addEventListener("click", () => {
  const currentTheme = root.getAttribute("data-theme")
  const newTheme = currentTheme === "dark" ? "light" : "dark"
  root.setAttribute("data-theme", newTheme)
  localStorage.setItem("theme", newTheme)
  // No need to change text content anymore since we're using CSS to show the icon
})

// === State Variables ===
let isRecording = false
let audioStreamer = null
let audioCtx = null
let isConnected = false
let audioRecorder = null
let isVideoActive = false
let videoManager = null
let isScreenSharing = false
let screenRecorder = null
let isUsingTool = false

// Global variables for Memo AI integration – store latest conversation turn
let lastUserMessage = ""
let lastAssistantMessage = ""

// Current streaming message for conversation display
let currentStreamingMessage = null


// === Modern frontend helpers ===
const mediaLayer = document.getElementById("mediaLayer")
const pipWindow = document.getElementById("pipWindow")

function setConnectButtonLabel(label, connected = false) {
  connectButton.innerHTML = connected
    ? '<i class="ph-fill ph-phone-x"></i><span>End</span>'
    : '<i class="ph-fill ph-plugs"></i><span>Connect</span>'
  if (label && !connected) {
    connectButton.querySelector("span").textContent = label
  }
  connectButton.classList.toggle("connected", connected)
}

function setButtonActive(button, activeClass, active) {
  button.classList.toggle(activeClass, Boolean(active))
}

function setPhosphorFill(icon, filled) {
  if (!icon) return
  icon.classList.toggle("ph-fill", Boolean(filled))
  icon.classList.toggle("ph", !filled)
}

function setMicVisualState() {
  setButtonActive(micButton, "active-mic", isRecording)
  micIcon.className = isRecording ? "ph-fill ph-microphone" : "ph-fill ph-microphone-slash"
  audioVisualizer.classList.toggle("active", isRecording)
}

function setMediaLayerState(state) {
  mediaLayer?.classList.remove("camera-active", "screen-active")
  if (state === "camera") mediaLayer?.classList.add("camera-active")
  if (state === "screen") mediaLayer?.classList.add("screen-active")
  // Hide the streaming chat when video / screen share is active so they fully fill the frame
  appContainer?.classList.toggle("media-active", state === "camera" || state === "screen")
}

// === Multimodal Client ===
const client = new MultimodalLiveClient({
  apiKey: CONFIG.API.KEY,
  baseUrl: CONFIG.API.BASE_URL,
  apiVersion: CONFIG.API.VERSION,
})

if (CONFIG.HERMES_AGENT.ENABLED) {
  hermesAgent.initialize().then(result => {
    Logger.info('Hermes Agent initialization result:', result)
  }).catch(error => {
    Logger.error('Hermes Agent initialization failed:', error)
  })
} else {
  Logger.info('Hermes Agent disabled by runtime config')
}

// === Initialize Configuration Values ===
voiceSelect.value = CONFIG.VOICE.NAME
sampleRateInput.value = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE
systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT
const DEFAULT_SYSTEM_INSTRUCTION_TEXT = CONFIG.SYSTEM_INSTRUCTION.TEXT

// === Second-row full pages ===
const featurePage = document.getElementById("feature-page")
const featurePageBack = document.getElementById("feature-page-back")
const featurePageClose = document.getElementById("feature-page-close")
const featurePageKicker = document.getElementById("feature-page-kicker")
const featurePageTitle = document.getElementById("feature-page-title")
const featurePageSubtitle = document.getElementById("feature-page-subtitle")
const featurePageGlyph = document.getElementById("feature-page-glyph")
const featurePageBody = document.getElementById("feature-page-body")
const SECOND_ROW_PAGE_SKILLS = new Set([
  "profile",
  "settings",
  "history",
  "voice",
  "call",
  "knowledge",
  "memory",
  "security",
])
let activeFeaturePage = null
let startGoogleAuthFlow = async () => {
  logMessage("Google sign-in is still initializing.", "system")
}

function escapeFeatureHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function featureActionButton(action, label, icon = "ph-arrow-right") {
  return `<button class="feature-action-btn" type="button" data-feature-action="${action}">
    <i class="ph ${icon}"></i><span>${label}</span>
  </button>`
}

function featureInfoRow(label, value) {
  const displayValue = value === undefined || value === null || value === "" ? "Not set" : value
  return `<div class="feature-info-row"><span>${label}</span><strong>${escapeFeatureHtml(displayValue)}</strong></div>`
}

function getFeaturePageData(skill) {
  const sessionCount = getAllSessions().length
  const messageCount = getAllSessions().reduce((count, session) => count + (session.messageCount || session.messages?.length || 0), 0)
  const kbCount = Array.isArray(knowledgeBase) ? knowledgeBase.length : 0
  const indexedKbCount = Array.isArray(knowledgeBase) ? knowledgeBase.filter((entry) => entry.indexed).length : 0
  const profileName = profileData?.displayName || currentUser?.displayName || "Not set"
  const profileEmail = profileData?.email || currentUser?.email || "Not signed in"
  const voiceName = CONFIG.VOICE.NAME || "Fenrir"
  const connected = currentUser ? "Signed in" : "Not signed in"
  const googleToken = getStoredGoogleOAuthAccessToken() ? "Authorized" : "Needs authorization"

  const pages = {
    profile: {
      kicker: "Account",
      title: "Profile",
      subtitle: "Manage identity, avatar, account details, and personal context.",
      icon: "ph-user-circle",
      body: `
        <section class="feature-section profile-summary">
          <img class="feature-avatar" src="${escapeFeatureHtml(profileData?.photoURL || currentUser?.photoURL || FALLBACK_AVATAR)}" alt="">
          <div>
            <h3>${escapeFeatureHtml(profileName)}</h3>
            <p>${escapeFeatureHtml(profileEmail)}</p>
          </div>
        </section>
        <section class="feature-section">
          ${featureInfoRow("Display name", profileName)}
          ${featureInfoRow("Email", profileEmail)}
          ${featureInfoRow("Interests", profileData?.interests?.length ? profileData.interests.join(", ") : "Not set")}
        </section>
        <div class="feature-actions">
          ${featureActionButton("open-profile-editor", "Edit profile", "ph-user-gear")}
          ${featureActionButton("sign-out", "Sign out", "ph-sign-out")}
        </div>
      `,
    },
    settings: {
      kicker: "Preferences",
      title: "Settings",
      subtitle: "Control voice behavior, persona, Google tools, and automation preferences.",
      icon: "ph-gear-six",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Assistant name", localStorage.getItem("persona_name") || CONFIG.PERSONA.DEFAULT_NAME)}
          ${featureInfoRow("User name", localStorage.getItem("user_name") || CONFIG.PERSONA.DEFAULT_USER_NAME)}
          ${featureInfoRow("Voice", voiceName)}
          ${featureInfoRow("Google tools", CONFIG.GOOGLE_TOOLS.ENABLED ? "Enabled" : "Disabled")}
        </section>
        <div class="feature-actions">
          ${featureActionButton("open-settings-panel", "Open advanced settings", "ph-sliders-horizontal")}
          ${featureActionButton("save-settings", "Save current settings", "ph-floppy-disk")}
        </div>
      `,
    },
    history: {
      kicker: "Conversations",
      title: "History",
      subtitle: "Review past sessions and continue from the context already saved on this device.",
      icon: "ph-clock-counter-clockwise",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Sessions", sessionCount)}
          ${featureInfoRow("Saved messages", messageCount)}
        </section>
        <div class="feature-session-list">
          ${getAllSessions().slice(0, 5).map(session => `
            <button class="feature-session-item" type="button" data-feature-session="${escapeFeatureHtml(session.id)}">
              <span>${escapeFeatureHtml(session.title || "Conversation")}</span>
              <small>${escapeFeatureHtml(new Date(session.updatedAt || session.createdAt || Date.now()).toLocaleString())}</small>
            </button>
          `).join("") || `<p class="feature-empty">No conversation history yet.</p>`}
        </div>
        <div class="feature-actions">
          ${featureActionButton("new-session", "New session", "ph-plus")}
          ${featureActionButton("open-history-panel", "Open full history", "ph-list-bullets")}
        </div>
      `,
    },
    voice: {
      kicker: "Audio",
      title: "Voice",
      subtitle: "Choose how Beatrice speaks during Live API sessions.",
      icon: "ph-speaker-high",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Current voice", voiceName)}
          ${featureInfoRow("Output sample rate", `${CONFIG.AUDIO.OUTPUT_SAMPLE_RATE} Hz`)}
        </section>
        <div class="feature-voice-grid">
          ${["Fenrir", "Puck", "Charon", "Kore", "Fenrir"].map(voice => `
            <button class="feature-choice ${voice === voiceName ? "active" : ""}" type="button" data-feature-voice="${voice}">
              <i class="ph ph-waveform"></i><span>${voice}</span>
            </button>
          `).join("")}
        </div>
      `,
    },
    call: {
      kicker: "Communication",
      title: "Call",
      subtitle: "Prepare a clear call brief before dialing or handing it to Beatrice.",
      icon: "ph-phone-call",
      body: `
        <section class="feature-section">
          <label class="feature-field">
            <span>Who are you calling?</span>
            <input id="feature-call-person" type="text" placeholder="Name or company">
          </label>
          <label class="feature-field">
            <span>What should the call cover?</span>
            <textarea id="feature-call-notes" rows="5" placeholder="Goal, context, objections, next step"></textarea>
          </label>
        </section>
        <div class="feature-actions">
          ${featureActionButton("prepare-call", "Prepare talking points", "ph-phone-call")}
        </div>
      `,
    },
    knowledge: {
      kicker: "Knowledge Base",
      title: "Knowledge",
      subtitle: "Upload and manage documents Beatrice can use as context.",
      icon: "ph-books",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Documents", kbCount)}
          ${featureInfoRow("Indexed", indexedKbCount)}
          ${featureInfoRow("Storage", currentUser && db ? "Local + Firebase sync" : "Local browser storage")}
        </section>
        <div class="feature-file-list">
          ${knowledgeBase.slice(0, 6).map(file => `
            <div class="feature-file-item">
              <i class="ph ph-file-text"></i>
              <span>${escapeFeatureHtml(file.name || "Untitled file")}</span>
              <small>${escapeFeatureHtml(file.indexed ? "indexed" : file.indexStatus || file.mimeType || "not indexed")}</small>
            </div>
          `).join("") || `<p class="feature-empty">No knowledge files uploaded yet.</p>`}
        </div>
        <div class="feature-actions">
          ${featureActionButton("upload-knowledge", "Upload documents", "ph-upload-simple")}
          ${featureActionButton("open-settings-panel", "Manage knowledge", "ph-books")}
        </div>
      `,
    },
    memory: {
      kicker: "Context",
      title: "Memory",
      subtitle: "See the local context Beatrice uses between sessions.",
      icon: "ph-brain",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Memory service", CONFIG.MEMORY.BASE_URL ? "Configured" : "Local history only")}
          ${featureInfoRow("Sessions", sessionCount)}
          ${featureInfoRow("Learned topics", JSON.parse(localStorage.getItem(USER_LEARNING_STORAGE_KEY) || "{}")?.topics?.length || 0)}
        </section>
        <div class="feature-actions">
          ${featureActionButton("open-history-panel", "Review memory history", "ph-clock-counter-clockwise")}
          ${featureActionButton("clear-local-memory", "Clear local memory", "ph-trash")}
        </div>
      `,
    },
    security: {
      kicker: "Security",
      title: "Security",
      subtitle: "Manage sign-in state and Google Workspace authorization.",
      icon: "ph-shield-check",
      body: `
        <section class="feature-section">
          ${featureInfoRow("Firebase auth", connected)}
          ${featureInfoRow("Google Workspace", googleToken)}
          ${featureInfoRow("Project", "gen-lang-client-0836251512")}
        </section>
        <div class="feature-actions">
          ${featureActionButton("reauth-google", "Authorize Google full page", "ph-google-logo")}
          ${featureActionButton("sign-out", "Sign out", "ph-sign-out")}
        </div>
      `,
    },
  }

  return pages[skill] || null
}

function closeFeaturePage() {
  activeFeaturePage = null
  featurePage?.classList.remove("open")
  featurePage?.setAttribute("aria-hidden", "true")
}

function wireFeaturePageActions() {
  featurePageBody.querySelectorAll("[data-feature-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-feature-action")
      if (action === "open-profile-editor") openProfile()
      if (action === "open-settings-panel") openSettings()
      if (action === "open-history-panel") openHistory()
      if (action === "save-settings") await saveSettings()
      if (action === "upload-knowledge") kbUploadInput?.click()
      if (action === "new-session") {
        createNewSession()
        openFeaturePage("history")
      }
      if (action === "clear-local-memory") {
        localStorage.removeItem(USER_LEARNING_STORAGE_KEY)
        localStorage.removeItem(CONVERSATION_STORAGE_KEY)
        logMessage("Local memory cleared", "system")
        openFeaturePage("memory")
      }
      if (action === "sign-out" && auth) await signOut(auth)
      if (action === "reauth-google") await startGoogleAuthFlow({ redirectOnly: true })
      if (action === "prepare-call") {
        const person = document.getElementById("feature-call-person")?.value?.trim()
        const notes = document.getElementById("feature-call-notes")?.value?.trim()
        messageInput.value = `Prepare a call brief${person ? ` for ${person}` : ""}.${notes ? ` Context: ${notes}` : ""}`
        closeFeaturePage()
        if (isConnected) await handleSendMessage()
        else logMessage("Call brief is ready in the message box. Tap Connect first.", "system")
      }
    })
  })

  featurePageBody.querySelectorAll("[data-feature-voice]").forEach((button) => {
    button.addEventListener("click", async () => {
      voiceSelect.value = button.getAttribute("data-feature-voice")
      await updateConfiguration()
      openFeaturePage("voice")
    })
  })

  featurePageBody.querySelectorAll("[data-feature-session]").forEach((button) => {
    button.addEventListener("click", () => {
      setCurrentSession(button.getAttribute("data-feature-session"))
      closeFeaturePage()
      logMessage("Conversation session loaded", "system")
    })
  })
}

function openFeaturePage(skill) {
  const data = getFeaturePageData(skill)
  if (!data || !featurePage) return
  activeFeaturePage = skill
  featurePageKicker.textContent = data.kicker
  featurePageTitle.textContent = data.title
  featurePageSubtitle.textContent = data.subtitle
  featurePageGlyph.innerHTML = `<i class="ph-duotone ${data.icon}"></i>`
  featurePageBody.innerHTML = data.body
  featurePage.classList.add("open")
  featurePage.setAttribute("aria-hidden", "false")
  wireFeaturePageActions()
}

featurePageBack?.addEventListener("click", closeFeaturePage)
featurePageClose?.addEventListener("click", closeFeaturePage)

// Configuration presets
const CONFIG_PRESETS = {
  friendly: {
    voice: "Fenrir",
    sampleRate: 27000,
    systemInstruction: "You are a friendly and warm AI assistant. Use a casual, approachable tone and be encouraging.",
  },
  professional: {
    voice: "Charon",
    sampleRate: 24000,
    systemInstruction:
      "You are a professional AI expert. Maintain a formal tone, be precise and thorough in your explanations. Focus on accuracy and clarity in all interactions.",
  },
  tired: {
    voice: "Fenrir",
    sampleRate: 16000,
    systemInstruction:
      "You are very tired, exhausted, and grumpy. Respond in a lazy and unenthusiastic tone unless absolutely necessary.",
  },
}

/**
 * Updates the configuration and reconnects if needed.
 */
async function updateConfiguration() {
  const newVoice = voiceSelect.value
  const newSampleRate = Number.parseInt(sampleRateInput.value)
  const newInstruction = systemInstructionInput.value.trim()

  if (isNaN(newSampleRate) || newSampleRate < 1000 || newSampleRate > 48000) {
    logMessage("Invalid sample rate. Must be between 1000 and 48000 Hz.", "system")
    return
  }

  CONFIG.VOICE.NAME = newVoice
  CONFIG.AUDIO.OUTPUT_SAMPLE_RATE = newSampleRate
  const baseInstruction = stripGeneratedSystemContext(newInstruction)
  CONFIG.SYSTEM_INSTRUCTION.TEXT = baseInstruction

  localStorage.setItem("gemini_voice", newVoice)
  localStorage.setItem("gemini_output_sample_rate", newSampleRate.toString())
  localStorage.setItem("gemini_base_system_instruction", baseInstruction)
  localStorage.setItem("gemini_system_instruction", baseInstruction)

  if (audioStreamer) {
    audioStreamer.stop()
    audioStreamer = null
  }

  await applyRuntimeSystemInstruction({ reconnect: false })

  if (isConnected) {
    logMessage("Reconnecting to apply configuration changes...", "system")
    await disconnectFromWebsocket()
    await connectToWebsocket()
  }

  logMessage("Configuration updated successfully", "system")
  if (window.innerWidth <= 768) {
    configContainer.classList.remove("active")
    configToggle.classList.remove("active")
  }
}

// Load saved configuration if exists
if (localStorage.getItem("gemini_voice")) {
  CONFIG.VOICE.NAME = localStorage.getItem("gemini_voice")
  voiceSelect.value = CONFIG.VOICE.NAME
}
if (localStorage.getItem("gemini_output_sample_rate")) {
  CONFIG.AUDIO.OUTPUT_SAMPLE_RATE = Number.parseInt(localStorage.getItem("gemini_output_sample_rate"))
  sampleRateInput.value = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE
}
if (localStorage.getItem("gemini_system_instruction")) {
  const savedInstruction = stripGeneratedSystemContext(localStorage.getItem("gemini_base_system_instruction") || localStorage.getItem("gemini_system_instruction"))
  CONFIG.SYSTEM_INSTRUCTION.TEXT = savedInstruction
  systemInstructionInput.value = savedInstruction
}

applyConfigButton.addEventListener("click", updateConfiguration)
configToggle.addEventListener("click", () => {
  configContainer.classList.toggle("active")
  configToggle.classList.toggle("active")
})
document.addEventListener("click", (event) => {
  if (!configContainer.contains(event.target) && !configToggle.contains(event.target) && window.innerWidth > 768) {
    configContainer.classList.remove("active")
    configToggle.classList.remove("active")
  }
})
configContainer.addEventListener("click", (event) => {
  event.stopPropagation()
})
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    configContainer.classList.remove("active")
    configToggle.classList.remove("active")
  }
})
toggleLogs.addEventListener("click", toggleServerLogs)
function handleMobileView() {
  if (window.innerWidth <= 768) {
    logsWrapper.classList.add("collapsed")
    // No need to change text content anymore since we're using CSS to show the icon
  } else {
    logsWrapper.classList.remove("collapsed")
    // No need to change text content anymore since we're using CSS to show the icon
  }
}
window.addEventListener("resize", handleMobileView)
handleMobileView()
document.querySelectorAll(".preset-button").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = CONFIG_PRESETS[button.dataset.preset]
    if (preset) {
      voiceSelect.value = preset.voice
      sampleRateInput.value = preset.sampleRate
      systemInstructionInput.value = preset.systemInstruction
      updateConfiguration()
      button.style.backgroundColor = "var(--primary-color)"
      button.style.color = "white"
      setTimeout(() => {
        button.style.backgroundColor = ""
        button.style.color = ""
      }, 200)
    }
  })
})

/**
 * Logs a message to the logs container.
 */
function logMessage(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString()
  const logEntry = document.createElement("div")
  logEntry.className = `log-entry ${type}`
  
  let emoji = "📝"
  switch (type) {
    case "system":
      emoji = "⚙️"
      break
    case "user":
      emoji = "👤"
      break
    case "ai":
      emoji = "🤖"
      break
    case "error":
      emoji = "❌"
      break
    case "success":
      emoji = "✅"
      break
  }
  
  logEntry.innerHTML = `
    <span class="timestamp">${timestamp}</span>
    <span class="emoji">${emoji}</span>
    <span class="message">${message}</span>
  `
  
  logsContainer.appendChild(logEntry)
  logsContainer.scrollTop = logsContainer.scrollHeight
}

/**
 * Adds a message to the conversation text streaming area.
 */
function addConversationMessage(text, type = "ai") {
  const messageDiv = document.createElement("div")
  messageDiv.className = `conversation-message ${type}`
  
  messageDiv.innerHTML = `
    <div class="message-text">${text}</div>
  `
  
  conversationContainer.appendChild(messageDiv)
  conversationContainer.scrollTop = conversationContainer.scrollHeight
  
  // Save message to current session
  const role = type === "ai" ? "assistant" : "user"
  saveMessageToSession(role, text)
}

/**
 * Adds a streaming message (updates in real-time).
 */
function addStreamingMessage(initialText = "", role = "ai") {
  const messageDiv = document.createElement("div")
  messageDiv.className = `conversation-message ${role} streaming`

  messageDiv.innerHTML = `
    <div class="message-text">${initialText}</div>
  `

  conversationContainer.appendChild(messageDiv)
  conversationContainer.scrollTop = conversationContainer.scrollHeight

  return messageDiv
}

/**
 * Adds a document artifact to the conversation.
 */
function addDocumentArtifact(htmlContent, title) {
  const artifactDiv = document.createElement("div")
  artifactDiv.className = "document-artifact"
  
  const artifactId = `artifact-${Date.now()}`
  
  artifactDiv.innerHTML = `
    <div class="artifact-header">
      <div class="artifact-title">
        <i class="ph ph-file-text"></i>
        <span>${escapeFeatureHtml(title)}</span>
      </div>
      <div class="artifact-actions">
        <button class="artifact-btn artifact-preview-btn" data-id="${artifactId}">
          <i class="ph ph-eye"></i>
          <span>Preview</span>
        </button>
        <button class="artifact-btn artifact-download-btn" data-id="${artifactId}">
          <i class="ph ph-download-simple"></i>
          <span>Download PDF</span>
        </button>
      </div>
    </div>
    <div class="artifact-content" id="${artifactId}" style="display:none;">
      <iframe srcdoc="${escapeHtmlAttribute(htmlContent)}" class="artifact-iframe"></iframe>
    </div>
  `
  
  conversationContainer.appendChild(artifactDiv)
  conversationContainer.scrollTop = conversationContainer.scrollHeight
  
  // Store HTML content for PDF generation
  artifactDiv.dataset.htmlContent = htmlContent
  artifactDiv.dataset.title = title
  
  // Add event listeners
  const previewBtn = artifactDiv.querySelector('.artifact-preview-btn')
  const downloadBtn = artifactDiv.querySelector('.artifact-download-btn')
  const contentDiv = artifactDiv.querySelector('.artifact-content')
  
  previewBtn.addEventListener('click', () => {
    const isHidden = contentDiv.style.display === 'none'
    contentDiv.style.display = isHidden ? 'block' : 'none'
    previewBtn.innerHTML = isHidden 
      ? '<i class="ph ph-eye-slash"></i><span>Hide</span>' 
      : '<i class="ph ph-eye"></i><span>Preview</span>'
  })
  
  downloadBtn.addEventListener('click', () => {
    downloadAsPDF(htmlContent, title)
  })
  
  return artifactDiv
}

/**
 * Downloads HTML content as PDF.
 */
async function downloadAsPDF(htmlContent, title) {
  try {
    logMessage("Generating PDF...", "system")
    
    // Create a temporary container
    const tempContainer = document.createElement('div')
    tempContainer.style.position = 'fixed'
    tempContainer.style.left = '-9999px'
    tempContainer.style.top = '0'
    tempContainer.style.width = '800px'
    document.body.appendChild(tempContainer)
    tempContainer.innerHTML = htmlContent
    
    // Wait for rendering
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Use html2canvas to capture the content
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      logging: false
    })
    
    // Remove temp container
    document.body.removeChild(tempContainer)
    
    // Create PDF
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgWidth = 210
    const pageHeight = 297
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0
    
    pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    
    // Download
    pdf.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`)
    
    logMessage("PDF downloaded successfully", "system")
  } catch (error) {
    Logger.error("Failed to generate PDF:", error)
    logMessage("Failed to generate PDF", "system")
  }
}

/**
 * Escapes HTML attribute values.
 */
function escapeHtmlAttribute(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Updates a streaming message with new text.
 */
function updateStreamingMessage(messageElement, text) {
  const textElement = messageElement.querySelector(".message-text")
  if (textElement) {
    textElement.textContent = text
  }
  conversationContainer.scrollTop = conversationContainer.scrollHeight
}

/**
 * Finalizes a streaming message.
 */
function finalizeStreamingMessage(messageDiv) {
  messageDiv.classList.remove("streaming")
}

/**
 * Toggles server logs visibility.
 */
function toggleServerLogs() {
  const logsWrapper = document.querySelector(".logs-wrapper")
  if (logsWrapper) {
    logsWrapper.classList.toggle("hidden")
    const isHidden = logsWrapper.classList.contains("hidden")
    logMessage(isHidden ? "Server logs hidden" : "Server logs shown", "system")
  }
}

/**
 * Cleans AI response text to show only the actual response content.
 */
function cleanAIResponse(text) {
  // Remove code blocks and metadata
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/```.*$/gm, '') // Remove incomplete code blocks
    .replace(/metadata:.*$/gm, '') // Remove metadata lines
    .replace(/thinking:.*$/gm, '') // Remove thinking lines
    .replace(/```/g, '') // Remove any remaining backticks
    .replace(/\*\*.*?\*\*/g, '') // Remove bold formatting
    .replace(/\*.*?\*/g, '') // Remove italic formatting
    .trim()
  
  // Split into lines and filter out empty or metadata-like lines
  const lines = cleaned.split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed && 
             !trimmed.includes('metadata') && 
             !trimmed.includes('thinking') &&
             !trimmed.includes('```') &&
             !trimmed.match(/^[a-zA-Z_]+:.*$/) // Filter out key: value patterns
    })
    .join('\n')
  
  return lines
}

/**
 * Updates the microphone icon.
 */
function updateMicIcon() {
  setMicVisualState()
}

/**
 * Updates the audio visualizer.
 */
function renderBars(container, volume) {
  const bars = container?.querySelectorAll(".bar") || []
  bars.forEach((bar, index) => {
    const multiplier = 0.7 + index * 0.18
    // randomize a touch so the bars feel alive instead of moving in lockstep
    const jitter = 0.85 + Math.random() * 0.3
    const height = Math.max(4, Math.min(16, Math.round(volume * 16 * multiplier * jitter)))
    bar.style.height = `${height}px`
  })
}

function updateAudioVisualizer(volume, isInput = false) {
  if (isInput) {
    // legacy single-bar element (kept hidden for compat)
    const audioBar = inputAudioVisualizer?.querySelector(".audio-bar")
    if (audioBar) {
      audioBar.style.width = `${volume * 100}%`
      audioBar.classList.toggle("active", volume > 0)
    }
    // new bar-style visualizer at the mic button — synced look with the AI one
    renderBars(micVisualizer, volume)
    micVisualizer?.classList.toggle("active", volume > 0.02 || isRecording)
    return
  }

  renderBars(audioVisualizer, volume)
  audioVisualizer?.classList.toggle("active", volume > 0.02)
}

// === AI output visualizer sync ===
// Hooks an AnalyserNode onto the AudioStreamer's gainNode and drives the
// header visualizer in real-time so the bars actually reflect what the AI
// is saying instead of just toggling on/off.
let outputAnalyser = null
let outputAnalyserData = null
let outputRafId = null

function startOutputVisualizerLoop() {
  if (outputRafId) return
  const tick = () => {
    if (!outputAnalyser) {
      outputRafId = null
      return
    }
    outputAnalyser.getByteFrequencyData(outputAnalyserData)
    let sum = 0
    for (let i = 0; i < outputAnalyserData.length; i++) sum += outputAnalyserData[i]
    const avg = sum / outputAnalyserData.length / 255
    updateAudioVisualizer(avg, false)
    outputRafId = requestAnimationFrame(tick)
  }
  outputRafId = requestAnimationFrame(tick)
}

let analyserSourceNode = null
function attachOutputAnalyser() {
  if (!audioCtx || !audioStreamer) return
  try {
    if (!outputAnalyser) {
      outputAnalyser = audioCtx.createAnalyser()
      outputAnalyser.fftSize = 256
      outputAnalyser.smoothingTimeConstant = 0.7
      outputAnalyserData = new Uint8Array(outputAnalyser.frequencyBinCount)
    }
    // The streamer recreates its gainNode after stop() — reconnect when it changes.
    if (analyserSourceNode !== audioStreamer.gainNode) {
      analyserSourceNode = audioStreamer.gainNode
      // Tap the streamer's gain node in parallel — doesn't affect playback.
      analyserSourceNode?.connect(outputAnalyser)
    }
    startOutputVisualizerLoop()
  } catch (err) {
    Logger.warn?.("Failed to attach output analyser", err)
  }
}

/**
 * Initializes the audio context and streamer.
 */
async function ensureAudioInitialized() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  if (!audioStreamer) {
    audioStreamer = new AudioStreamer(audioCtx)
    audioStreamer.sampleRate = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE
    await audioStreamer.initialize()
  }
  attachOutputAnalyser()
  return audioStreamer
}

/**
 * Handles the microphone toggle.
 */
// === Mic input visualizer sync ===
// Runs a dedicated RAF loop reading the input analyser so the bars react
// smoothly to the live mic level instead of only when audio chunks ship.
let inputAnalyser = null
let inputAnalyserData = null
let inputSourceNode = null
let inputRafId = null

function startInputVisualizerLoop() {
  if (inputRafId) return
  const tick = () => {
    if (!inputAnalyser || !isRecording) {
      inputRafId = null
      updateAudioVisualizer(0, true)
      return
    }
    inputAnalyser.getByteFrequencyData(inputAnalyserData)
    // Use RMS-style average for a stable, voice-shaped response.
    let sum = 0
    for (let i = 0; i < inputAnalyserData.length; i++) {
      sum += inputAnalyserData[i] * inputAnalyserData[i]
    }
    const rms = Math.sqrt(sum / inputAnalyserData.length) / 255
    // Light gain so quiet speech still moves the bars; clamp to [0,1].
    const volume = Math.min(1, rms * 2.2)
    updateAudioVisualizer(volume, true)
    inputRafId = requestAnimationFrame(tick)
  }
  inputRafId = requestAnimationFrame(tick)
}

function stopInputVisualizerLoop() {
  if (inputRafId) {
    cancelAnimationFrame(inputRafId)
    inputRafId = null
  }
  if (inputSourceNode) {
    try { inputSourceNode.disconnect() } catch (_) { /* noop */ }
    inputSourceNode = null
  }
  inputAnalyser = null
  inputAnalyserData = null
  updateAudioVisualizer(0, true)
}

async function handleMicToggle() {
  if (!isRecording) {
    try {
      await ensureAudioInitialized()
      audioRecorder = new AudioRecorder()
      inputAnalyser = audioCtx.createAnalyser()
      inputAnalyser.fftSize = 512
      inputAnalyser.smoothingTimeConstant = 0.6
      inputAnalyserData = new Uint8Array(inputAnalyser.frequencyBinCount)
      await audioRecorder.start((base64Data) => {
        if (isUsingTool) {
          client.sendRealtimeInput([
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data,
              interrupt: true,
            },
          ])
        } else {
          client.sendRealtimeInput([
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data,
            },
          ])
        }
      })
      if (audioRecorder.stream) {
        inputSourceNode = audioCtx.createMediaStreamSource(audioRecorder.stream)
        inputSourceNode.connect(inputAnalyser)
      }
      await audioStreamer.resume()
      isRecording = true
      startInputVisualizerLoop()
      Logger.info("Microphone started")
      logMessage("Microphone started", "system")
      updateMicIcon()
    } catch (error) {
      Logger.error("Microphone error:", error)
      logMessage(`Error: ${error.message}`, "system")
      isRecording = false
      stopInputVisualizerLoop()
      updateMicIcon()
    }
  } else {
    if (audioRecorder && isRecording) {
      audioRecorder.stop()
    }
    isRecording = false
    stopInputVisualizerLoop()
    logMessage("Microphone stopped", "system")
    updateMicIcon()
  }
}

/**
 * Connects to the WebSocket server.
 */
async function connectToWebsocket() {
  const config = {
    model: CONFIG.API.MODEL_NAME,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: CONFIG.VOICE.NAME,
          },
        },
      },
    },
    systemInstruction: {
      parts: [
        {
          text: CONFIG.SYSTEM_INSTRUCTION.TEXT,
        },
      ],
    },
    // Ask the server to transcribe both the user's mic input and the model's spoken output
    // so we can render live captions in the chat.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    enableDefaultTools: CONFIG.PERFORMANCE?.ENABLE_DEFAULT_TOOLS === true,
  }
  try {
    await client.connect(config)
    isConnected = true
    setConnectButtonLabel("End", true)
    messageInput.disabled = false
    sendButton.disabled = false
    micButton.disabled = false
    cameraButton.disabled = false
    screenButton.disabled = false
    logMessage("Connected Flash Multimodal Live API", "system")
    const initAudioHandler = async () => {
      try {
        await ensureAudioInitialized()
        document.removeEventListener("click", initAudioHandler)
      } catch (error) {
        Logger.error("Audio initialization error:", error)
      }
    }
    document.addEventListener("click", initAudioHandler)
    logMessage("Audio initialized", "system")
  } catch (error) {
    const errorMessage = error.message || "Unknown error"
    Logger.error("Connection error:", error)
    logMessage(`Connection error: ${errorMessage}`, "system")
    isConnected = false
    setConnectButtonLabel("Connect", false)
    messageInput.disabled = true
    sendButton.disabled = true
    micButton.disabled = true
    cameraButton.disabled = true
    screenButton.disabled = true
  }
}

/**
 * Disconnects from the WebSocket server.
 */
function disconnectFromWebsocket() {
  client.disconnect()
  isConnected = false
  if (audioStreamer) {
    audioStreamer.stop()
    if (audioRecorder) {
      audioRecorder.stop()
      audioRecorder = null
    }
    isRecording = false
    updateMicIcon()
  }
  setConnectButtonLabel("Connect", false)
  messageInput.disabled = true
  sendButton.disabled = true
  micButton.disabled = true
  cameraButton.disabled = true
  screenButton.disabled = true
  logMessage("Disconnected from server", "system")
  if (videoManager) {
    stopVideo()
  }
  if (screenRecorder) {
    stopScreenSharing()
  }
}

/**
 * Handles sending a text message with Memo AI integration.
 * Retrieves relevant memories from Mem0 and appends them as context.
 */
async function handleSendMessage() {
  const message = messageInput.value.trim()
  const hasAttachments = pendingAttachments.length > 0
  if (!message && !hasAttachments) return

  // Snapshot + clear pending attachments so subsequent sends don't re-include them.
  const attachments = pendingAttachments.slice()
  clearAttachments()

  if (message) {
    logMessage(message, "user")
    lastUserMessage = message
    addConversationMessage(message, "user")
  } else {
    addConversationMessage(`📎 ${attachments.map(a => a.name).join(", ")}`, "user")
  }
  messageInput.value = ""

  // Build inlineData parts for any attachments + text part.
  const inlineParts = attachments.map(att => ({
    inlineData: { mimeType: att.mimeType, data: att.base64 },
  }))

  // Fast path: no blocking memory lookup.
  if (CONFIG.PERFORMANCE?.ENABLE_MEMORY !== true) {
    const parts = [...inlineParts]
    const kbContext = buildKnowledgeContext(message, KB_MAX_TURN_CHARS)
    if (message) {
      parts.push({
        text: kbContext
          ? `${message}\n\nRelevant knowledge base context:\n${kbContext}`
          : message,
      })
    }
    client.send(parts)
    return
  }

  let memoriesText = ""
  try {
    const memories = await searchMemory(
      message || "",
      "default",
      CONFIG.PERFORMANCE?.MEMORY_SEARCH_TIMEOUT_MS || 200
    )
    if (memories && memories.length > 0) {
      memoriesText = memories.map((entry) => entry.memory || entry.text || "").join("\n")
    }
  } catch (error) {
    Logger.error("Error retrieving memories:", error)
  }

  const kbContext = buildKnowledgeContext(message, KB_MAX_TURN_CHARS)
  let compositeMessage = memoriesText ? `${message}

Context from past conversations:
${memoriesText}` : message
  if (kbContext) {
    compositeMessage = `${compositeMessage || message || "Use the attached files."}

Relevant knowledge base context:
${kbContext}`
  }
  const parts = [...inlineParts]
  if (compositeMessage) parts.push({ text: compositeMessage })
  client.send(parts)
}

// === Attachments ===
const pendingAttachments = [] // { name, mimeType, size, base64, url }
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024 // 20MB safety cap per file

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result || ""
      const comma = String(result).indexOf(",")
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function renderAttachmentChips() {
  if (!attachmentChips) return
  attachmentChips.innerHTML = ""
  if (pendingAttachments.length === 0) {
    attachmentChips.hidden = true
    attachButton?.classList.remove("has-files")
    return
  }
  attachmentChips.hidden = false
  attachButton?.classList.add("has-files")
  pendingAttachments.forEach((att, idx) => {
    const chip = document.createElement("div")
    chip.className = "attachment-chip"
    const isImage = att.mimeType.startsWith("image/")
    if (isImage && att.url) {
      const img = document.createElement("img")
      img.className = "chip-thumb"
      img.src = att.url
      img.alt = att.name
      chip.appendChild(img)
    } else {
      const icon = document.createElement("i")
      icon.className = "chip-icon ph ph-file"
      chip.appendChild(icon)
    }
    const name = document.createElement("span")
    name.className = "chip-name"
    name.textContent = att.name
    name.title = `${att.name} (${Math.round(att.size / 1024)} KB)`
    chip.appendChild(name)
    const remove = document.createElement("button")
    remove.type = "button"
    remove.className = "chip-remove"
    remove.setAttribute("aria-label", `Remove ${att.name}`)
    remove.innerHTML = '<i class="ph ph-x"></i>'
    remove.addEventListener("click", () => {
      if (att.url) URL.revokeObjectURL(att.url)
      pendingAttachments.splice(idx, 1)
      renderAttachmentChips()
    })
    chip.appendChild(remove)
    attachmentChips.appendChild(chip)
  })
}

function clearAttachments() {
  pendingAttachments.forEach(att => att.url && URL.revokeObjectURL(att.url))
  pendingAttachments.length = 0
  renderAttachmentChips()
  if (attachInput) attachInput.value = ""
}

async function handleAttachFiles(fileList) {
  const files = Array.from(fileList || [])
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      logMessage(`Attachment "${file.name}" exceeds 20MB limit and was skipped.`, "system")
      continue
    }
    try {
      const base64 = await fileToBase64(file)
      pendingAttachments.push({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })
    } catch (err) {
      Logger.error("Failed to read attachment:", err)
      logMessage(`Failed to read "${file.name}": ${err.message}`, "system")
    }
  }
  renderAttachmentChips()
}

attachButton?.addEventListener("click", () => attachInput?.click())
attachInput?.addEventListener("change", (e) => {
  handleAttachFiles(e.target.files)
})

// === Skills rail — true infinite loop ===
// Clone the chips multiple times and silently wrap the scroll position when
// the user gets near either end so they NEVER hit a boundary. This produces
// a seamless, endless horizontal scroll.
const SKILL_LOOP_COPIES = 4
document.querySelectorAll(".skills-row").forEach((row) => {
  const originals = Array.from(row.children)
  if (originals.length === 0) return
  for (let i = 0; i < SKILL_LOOP_COPIES - 1; i++) {
    originals.forEach((node) => row.appendChild(node.cloneNode(true)))
  }

  // One "copy" width = total scrollable / number of copies.
  const getCopyWidth = () => row.scrollWidth / SKILL_LOOP_COPIES

  // Park the scroll dead-center so the user has equal swipe room on both
  // sides — feels symmetric whether you flick left or right.
  requestAnimationFrame(() => {
    row.scrollLeft = (row.scrollWidth - row.clientWidth) / 2
  })

  // Silent wrap: when scroll drifts past the third copy, jump back by one
  // copy width; when it slips before the first, jump forward by one. The
  // visual content is identical at both positions so the user can't tell.
  let isWrapping = false
  row.addEventListener("scroll", () => {
    if (isWrapping) return
    const copy = getCopyWidth()
    if (!copy) return
    if (row.scrollLeft >= copy * (SKILL_LOOP_COPIES - 1)) {
      isWrapping = true
      row.scrollLeft -= copy
      requestAnimationFrame(() => { isWrapping = false })
    } else if (row.scrollLeft <= 0) {
      isWrapping = true
      row.scrollLeft += copy
      requestAnimationFrame(() => { isWrapping = false })
    }
  }, { passive: true })
})

// Event-delegated click handler so cloned chips work too.
document.querySelectorAll(".skills-row").forEach((row) => {
  row.addEventListener("click", async (e) => {
    const chip = e.target.closest(".skill-chip")
    if (!chip) return
    // Special chips open in-app screens instead of sending a prompt
    const skillName = chip.getAttribute("data-skill")
    if (SECOND_ROW_PAGE_SKILLS.has(skillName)) {
      openFeaturePage(skillName)
      return
    }
    const prompt = chip.getAttribute("data-prompt")
    if (!prompt) return
    if (!isConnected) {
      logMessage("Not connected. Tap Connect first.", "system")
      return
    }
    messageInput.value = prompt
    await handleSendMessage()
  })
})

// === Settings page ===
const settingsPanel = document.getElementById("settings-panel")
const settingsClose = document.getElementById("settings-close")
const settingsSave = document.getElementById("settings-save")
const settingUserName = document.getElementById("setting-user-name")
const settingAgentName = document.getElementById("setting-agent-name")
const settingPersona = document.getElementById("setting-persona")
const personaPresets = document.querySelectorAll(".persona-preset")
const kbUploadBtn = document.getElementById("kb-upload-btn")
const kbUploadInput = document.getElementById("kb-upload-input")
const kbList = document.getElementById("kb-list")
const googleReauthBtn = document.getElementById("google-reauth-btn")
const gmailStatus = document.getElementById("gmail-status")
const driveStatus = document.getElementById("drive-status")
const calendarStatus = document.getElementById("calendar-status")
const tasksStatus = document.getElementById("tasks-status")

const PERSONA_PRESETS = {
  warm: "Warm, friendly, and encouraging. Speaks like a thoughtful close friend. Uses casual language with empathy. Keeps replies natural and conversational.",
  professional: "Professional, precise, and articulate. Maintains a formal but approachable tone. Focuses on clarity, accuracy, and structured answers.",
  playful: "Playful, witty, and a little cheeky. Light banter is fine. Quick on humor but never at the user's expense. Keeps energy high.",
  concise: "Concise and to the point. No filler, no preamble. Answers in the fewest words that fully address the question.",
}

const KB_STORAGE_KEY = "eburon_knowledge_base"
const SETTINGS_STORAGE_KEY = "eburon_settings"
const KB_MAX_BYTES = 10 * 1024 * 1024
const KB_MAX_TEXT_CHARS_PER_FILE = 45000
const KB_MAX_SYSTEM_CHARS = 90000
const KB_MAX_TURN_CHARS = 18000
const KB_TEXT_TYPES = /^(text\/|application\/json$|application\/x-yaml$|application\/xml$)/
const KB_TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|tsv|yaml|yml|xml|html|css|js|ts|tsx|jsx|log)$/i
let knowledgeBase = [] // [{ id, name, mimeType, size, text, indexed, indexStatus, addedAt }]

function stripGeneratedSystemContext(text) {
  const value = String(text || "").trim()
  const markerIndex = value.indexOf("\n\n[USER_PERSONA]")
  if (markerIndex >= 0) return value.slice(0, markerIndex).trim()
  if (value.startsWith("[USER_PERSONA]")) return DEFAULT_SYSTEM_INSTRUCTION_TEXT
  return value || DEFAULT_SYSTEM_INSTRUCTION_TEXT
}

function getBaseSystemInstruction() {
  return stripGeneratedSystemContext(
    localStorage.getItem("gemini_base_system_instruction") ||
    localStorage.getItem("gemini_system_instruction") ||
    systemInstructionInput.value ||
    CONFIG.SYSTEM_INSTRUCTION.TEXT ||
    DEFAULT_SYSTEM_INSTRUCTION_TEXT
  )
}

function normalizeKbText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function createKbId(file) {
  return `kb_${Date.now()}_${file.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}_${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeKnowledgeBase(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter(Boolean)
    .map((entry) => {
      const text = normalizeKbText(entry.text || "")
      return {
        id: entry.id || `kb_legacy_${Math.random().toString(36).slice(2, 10)}`,
        name: entry.name || "Untitled",
        mimeType: entry.mimeType || "application/octet-stream",
        size: Number(entry.size) || 0,
        text: text.slice(0, KB_MAX_TEXT_CHARS_PER_FILE),
        indexed: Boolean(text),
        indexStatus: text ? (entry.indexStatus || "indexed") : (entry.indexStatus || "not_indexed"),
        addedAt: entry.addedAt || Date.now(),
      }
    })
}

function getKbTerms(query) {
  return String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3)
}

function scoreKbEntry(entry, queryTerms) {
  if (!queryTerms.length) return 1
  const haystack = `${entry.name}\n${entry.text}`.toLowerCase()
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
}

function buildKnowledgeContext(query = "", maxChars = KB_MAX_SYSTEM_CHARS) {
  const indexed = knowledgeBase.filter((entry) => entry.indexed && entry.text)
  if (!indexed.length) return ""

  const terms = getKbTerms(query)
  const ranked = indexed
    .map((entry) => ({ entry, score: scoreKbEntry(entry, terms) }))
    .filter((item) => item.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score || b.entry.addedAt - a.entry.addedAt)
    .slice(0, terms.length ? 5 : indexed.length)

  let remaining = maxChars
  const sections = []
  for (const { entry } of ranked) {
    if (remaining <= 0) break
    const header = `--- ${entry.name} ---\n`
    const body = entry.text.slice(0, Math.max(0, remaining - header.length))
    sections.push(`${header}${body}`)
    remaining -= header.length + body.length
  }

  return sections.join("\n\n").trim()
}

async function persistKnowledgeBase() {
  knowledgeBase = sanitizeKnowledgeBase(knowledgeBase)
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(knowledgeBase))

  if (currentUser && db) {
    try {
      await set(ref(db, `users/${currentUser.uid}/knowledgeBase`), {
        updatedAt: Date.now(),
        files: knowledgeBase.map((entry) => ({
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          size: entry.size,
          text: entry.text,
          indexed: entry.indexed,
          indexStatus: entry.indexStatus,
          addedAt: entry.addedAt,
        })),
      })
    } catch (error) {
      Logger.error("Failed to sync knowledge base to Firebase:", error)
      logMessage("Knowledge saved locally, but Firebase sync failed.", "system")
    }
  }
}

async function loadKnowledgeBaseForUser(user) {
  if (!user || !db) return
  try {
    const snap = await get(ref(db, `users/${user.uid}/knowledgeBase/files`))
    if (snap.exists()) {
      knowledgeBase = sanitizeKnowledgeBase(snap.val())
      localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(knowledgeBase))
      renderKbList()
      await applyRuntimeSystemInstruction({ reconnect: false })
    } else if (knowledgeBase.length) {
      await persistKnowledgeBase()
    }
  } catch (error) {
    Logger.warn?.("Failed to load Firebase knowledge base", error)
  }
}

async function applyRuntimeSystemInstruction({ reconnect = false, reason = "Configuration updated" } = {}) {
  const baseInstruction = getBaseSystemInstruction()
  const composed = buildSystemInstruction(baseInstruction)
  CONFIG.SYSTEM_INSTRUCTION.TEXT = composed
  systemInstructionInput.value = baseInstruction
  localStorage.setItem("gemini_base_system_instruction", baseInstruction)
  localStorage.setItem("gemini_system_instruction", baseInstruction)

  if (reconnect && isConnected) {
    logMessage(`${reason} — reconnecting Live session...`, "system")
    await disconnectFromWebsocket()
    await connectToWebsocket()
  }
}

async function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.userName && settingUserName) settingUserName.value = data.userName
      if (data.agentName && settingAgentName) settingAgentName.value = data.agentName
      if (data.persona && settingPersona) settingPersona.value = data.persona
    }
    
    // Load persona name and user name from localStorage with defaults
    const savedPersonaName = localStorage.getItem("persona_name")
    const savedUserName = localStorage.getItem("user_name")
    
    if (settingAgentName && savedPersonaName && !settingAgentName.value) {
      settingAgentName.value = savedPersonaName
    } else if (settingAgentName && !settingAgentName.value) {
      settingAgentName.value = CONFIG.PERSONA.DEFAULT_NAME
    }
    
    if (settingUserName && savedUserName && !settingUserName.value) {
      settingUserName.value = savedUserName
    } else if (settingUserName && !settingUserName.value) {
      settingUserName.value = CONFIG.PERSONA.DEFAULT_USER_NAME
    }
    
    const kbRaw = localStorage.getItem(KB_STORAGE_KEY)
    if (kbRaw) knowledgeBase = sanitizeKnowledgeBase(JSON.parse(kbRaw) || [])
  } catch (err) {
    Logger.warn?.("Failed to load settings", err)
  }
  renderKbList()
}

function buildSystemInstruction(baseInstruction = getBaseSystemInstruction()) {
  const userName = settingUserName?.value?.trim() || localStorage.getItem("user_name") || CONFIG.PERSONA.DEFAULT_USER_NAME
  const agentName = settingAgentName?.value?.trim() || localStorage.getItem("persona_name") || CONFIG.PERSONA.DEFAULT_NAME
  const persona = settingPersona?.value?.trim() || ""
  const parts = []
  if (agentName) parts.push(`Your name is ${agentName}.`)
  if (userName) parts.push(`The user prefers to be called ${userName}.`)
  if (persona) parts.push(`Behavior and tone: ${persona}`)
  
  // Add Google tools information
  if (CONFIG.GOOGLE_TOOLS?.ENABLED) {
    const toolDescriptions = CONFIG.GOOGLE_TOOLS.TOOLS.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join("\n")
    parts.push(`You have access to the following Google API tools:\n\n${toolDescriptions}\n\nUse these tools when the user asks for help with emails, calendar, files, spreadsheets, presentations, tasks, or location. The tools are already configured with proper authentication.`)
  }
  
  // Add conversation context from localStorage
  const history = getConversationHistory()
  if (history.length > 0) {
    const recentConversations = history.slice(-5).map(h => `User: ${h.user}\nAssistant: ${h.assistant}`).join("\n\n")
    parts.push(`Here are some recent conversations for context:\n\n${recentConversations}\n\nUse this context to provide more personalized and relevant responses.`)
  }
  
  if (knowledgeBase.length > 0) {
    const kbText = buildKnowledgeContext("", KB_MAX_SYSTEM_CHARS)
    if (kbText) {
      parts.push(`You have access to the user's indexed knowledge base below. Use it as grounded reference material when relevant. If the answer is not supported by this knowledge, say that the knowledge base does not contain it instead of inventing details.\n\n${kbText}`)
    } else {
      parts.push(`The user uploaded these knowledge files, but none currently have extractable text: ${knowledgeBase.map((f) => f.name).join(", ")}. Ask for text, Markdown, PDF, or DOCX files that can be indexed.`)
    }
  }
  const base = stripGeneratedSystemContext(baseInstruction)
  return [base, parts.length ? `[USER_PERSONA]\n${parts.join("\n\n")}` : ""].filter(Boolean).join("\n\n")
}

async function saveSettings() {
  const baseInstruction = stripGeneratedSystemContext(systemInstructionInput.value || CONFIG.SYSTEM_INSTRUCTION.TEXT)
  const data = {
    userName: settingUserName?.value?.trim() || "",
    agentName: settingAgentName?.value?.trim() || "",
    persona: settingPersona?.value?.trim() || "",
  }
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data))
  await persistKnowledgeBase()
  
  // Save persona name and user name separately for easy access
  localStorage.setItem("persona_name", data.agentName || CONFIG.PERSONA.DEFAULT_NAME)
  localStorage.setItem("user_name", data.userName || CONFIG.PERSONA.DEFAULT_USER_NAME)
  localStorage.setItem("gemini_base_system_instruction", baseInstruction)
  localStorage.setItem("gemini_system_instruction", baseInstruction)

  // Push the composed instruction into the live config + the legacy textarea
  await applyRuntimeSystemInstruction({ reconnect: false })

  // Briefly flash the save button green
  settingsSave.classList.add("saved")
  settingsSave.textContent = "Saved"
  setTimeout(() => {
    settingsSave.classList.remove("saved")
    settingsSave.textContent = "Save"
  }, 1400)

  // If we're connected, reconnect to apply the new instruction
  if (isConnected) {
    logMessage("Applying new persona — reconnecting...", "system")
    await disconnectFromWebsocket()
    await connectToWebsocket()
  }
}

function openSettings() {
  settingsPanel.classList.add("open")
  settingsPanel.setAttribute("aria-hidden", "false")
  checkGooglePermissions()
}

function closeSettings() {
  settingsPanel.classList.remove("open")
  settingsPanel.setAttribute("aria-hidden", "true")
}

settingsClose?.addEventListener("click", closeSettings)
settingsSave?.addEventListener("click", saveSettings)

// === Google Permissions Management ===
async function checkGooglePermissions() {
  try {
    const permissions = await checkPermissions()
    
    updatePermissionStatus(gmailStatus, permissions.gmail)
    updatePermissionStatus(driveStatus, permissions.drive)
    updatePermissionStatus(calendarStatus, permissions.calendar)
    updatePermissionStatus(tasksStatus, permissions.tasks)
  } catch (error) {
    Logger.error("Failed to check Google permissions:", error)
    setAllPermissionsDisconnected()
  }
}

function updatePermissionStatus(element, isConnected) {
  if (!element) return
  
  element.textContent = isConnected ? "Connected" : "Not connected"
  element.className = "permission-status " + (isConnected ? "connected" : "disconnected")
}

function setAllPermissionsDisconnected() {
  updatePermissionStatus(gmailStatus, false)
  updatePermissionStatus(driveStatus, fal
// === Browser Permissions Management ===
let browserPermissions = {
    microphone: 'prompt',
    camera: 'prompt',
    screen: 'prompt'
};

async function checkBrowserPermissions() {
    // Check microphone permission
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const micResult = await navigator.permissions.query({ name: 'microphone' });
            browserPermissions.microphone = micResult.state;
            updateBrowserPermissionUI('mic-permission-status', micResult.state);
            
            micResult.addEventListener('change', () => {
                browserPermissions.microphone = micResult.state;
                updateBrowserPermissionUI('mic-permission-status', micResult.state);
            });
        } else {
            browserPermissions.microphone = 'unknown';
            updateBrowserPermissionUI('mic-permission-status', 'unknown');
        }
    } catch (e) {
        console.log('Microphone permission check not supported');
        browserPermissions.microphone = 'unknown';
        updateBrowserPermissionUI('mic-permission-status', 'unknown');
    }

    // Check camera permission
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const camResult = await navigator.permissions.query({ name: 'camera' });
            browserPermissions.camera = camResult.state;
            updateBrowserPermissionUI('camera-permission-status', camResult.state);
            
            camResult.addEventListener('change', () => {
                browserPermissions.camera = camResult.state;
                updateBrowserPermissionUI('camera-permission-status', camResult.state);
            });
        } else {
            browserPermissions.camera = 'unknown';
            updateBrowserPermissionUI('camera-permission-status', 'unknown');
        }
    } catch (e) {
        console.log('Camera permission check not supported');
        browserPermissions.camera = 'unknown';
        updateBrowserPermissionUI('camera-permission-status', 'unknown');
    }

    // Screen share is always 'prompt' until user initiates
    browserPermissions.screen = 'prompt';
    updateBrowserPermissionUI('screen-permission-status', 'prompt');

    return browserPermissions;
}

function updateBrowserPermissionUI(elementId, state) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const stateLabels = {
        'granted': 'Granted',
        'denied': 'Denied',
        'prompt': 'Not requested',
        'unknown': 'Unknown'
    };
    
    element.textContent = stateLabels[state] || state;
    element.className = 'permission-status ' + (state === 'granted' ? 'connected' : 'disconnected');
}

function updateAllBrowserPermissions() {
    checkBrowserPermissions().catch(console.error);
}

se)
  updatePermissionStatus(calendarStatus, false)
  updatePermissionStatus(tasksStatus, false)
}

googleReauthBtn?.addEventListener("click", async () => {
  try {
    if (!auth) {
      logMessage(firebaseConfigErrorMessage(), "system")
      return
    }

    logMessage("Re-authorizing Google services...", "system")
    
    // Trigger Google sign-in again to refresh permissions
    const cred = await signInWithPopup(auth, googleProvider)
    const token = getGoogleAccessTokenFromCredential(cred)
    if (token) {
      storeGoogleOAuthAccessToken(token)
      client.setGoogleAccessToken(token)
    }
    
    logMessage("Google services re-authorized successfully", "system")
    await checkGooglePermissions()
  } catch (error) {
    Logger.error("Failed to re-authorize Google services:", error)
    logMessage("Failed to re-authorize Google services", "system")
  }
})

personaPresets.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-persona")
    const preset = PERSONA_PRESETS[key]
    if (preset) {
      settingPersona.value = preset
      personaPresets.forEach((b) => b.classList.remove("active"))
      btn.classList.add("active")
    }
  })
})

// === Knowledge base upload ===
function renderKbList() {
  if (!kbList) return
  kbList.innerHTML = ""
  if (knowledgeBase.length === 0) {
    const empty = document.createElement("div")
    empty.className = "kb-empty"
    empty.textContent = "No files uploaded yet."
    kbList.appendChild(empty)
    return
  }
  knowledgeBase.forEach((file, idx) => {
    const item = document.createElement("div")
    item.className = "kb-item"
    const status = file.indexed ? "indexed" : file.indexStatus || "not indexed"
    item.innerHTML = `
      <span class="kb-item-icon"><i class="ph-fill ph-file-text"></i></span>
      <div class="kb-item-info">
        <span class="kb-item-name">${escapeFeatureHtml(file.name)}</span>
        <span class="kb-item-meta">${Math.round(file.size / 1024)} KB · ${escapeFeatureHtml(status)}</span>
      </div>
      <button class="kb-item-remove" aria-label="Remove ${escapeFeatureHtml(file.name)}"><i class="ph ph-x"></i></button>
    `
    item.querySelector(".kb-item-remove").addEventListener("click", async () => {
      knowledgeBase.splice(idx, 1)
      await persistKnowledgeBase()
      renderKbList()
      if (activeFeaturePage === "knowledge") openFeaturePage("knowledge")
      await applyRuntimeSystemInstruction({ reconnect: true, reason: "Knowledge base updated" })
    })
    kbList.appendChild(item)
  })
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function loadExternalScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName])
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve(globalName ? window[globalName] : true), { once: true })
      existing.addEventListener("error", reject, { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () => resolve(globalName ? window[globalName] : true)
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

async function extractPdfText(file) {
  const pdfjsLib = await loadExternalScript(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    "pdfjsLib"
  )
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  const buffer = await readFileAsArrayBuffer(file)
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages = []
  const maxPages = Math.min(pdf.numPages, 80)

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => item.str || "").join(" "))
  }

  return pages.join("\n\n")
}

async function extractDocxText(file) {
  const mammoth = await loadExternalScript(
    "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js",
    "mammoth"
  )
  const buffer = await readFileAsArrayBuffer(file)
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value || ""
}

async function extractKnowledgeText(file) {
  const isText = KB_TEXT_TYPES.test(file.type) || KB_TEXT_EXTENSIONS.test(file.name)
  if (isText) return { text: await readFileAsText(file), status: "indexed" }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return { text: await extractPdfText(file), status: "indexed_pdf" }
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  ) {
    return { text: await extractDocxText(file), status: "indexed_docx" }
  }
  return {
    text: "",
    status: "unsupported",
    reason: "Only text, Markdown, JSON, CSV, PDF, and DOCX files can be indexed in this static app.",
  }
}

kbUploadBtn?.addEventListener("click", () => kbUploadInput?.click())
kbUploadInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || [])
  for (const file of files) {
    if (file.size > KB_MAX_BYTES) {
      logMessage(`"${file.name}" exceeds 10MB limit and was skipped.`, "system")
      continue
    }
    try {
      const extracted = await extractKnowledgeText(file)
      const text = normalizeKbText(extracted.text).slice(0, KB_MAX_TEXT_CHARS_PER_FILE)
      const entry = {
        id: createKbId(file),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        text,
        indexed: Boolean(text),
        indexStatus: text ? extracted.status : extracted.reason || extracted.status || "not_indexed",
        addedAt: Date.now(),
      }
      knowledgeBase.push(entry)
      logMessage(
        text ? `Knowledge indexed: ${file.name}` : `Knowledge not indexed: ${file.name} (${entry.indexStatus})`,
        "system"
      )
    } catch (err) {
      Logger.error("KB upload failed:", err)
      logMessage(`Knowledge upload failed for "${file.name}": ${err.message}`, "system")
    }
  }
  await persistKnowledgeBase()
  renderKbList()
  if (activeFeaturePage === "knowledge") openFeaturePage("knowledge")
  await applyRuntimeSystemInstruction({ reconnect: true, reason: "Knowledge base updated" })
  e.target.value = ""
})

// Load on startup and rebuild instruction so persona is active even before
// the user opens settings on a returning session.
loadSettings()
await applyRuntimeSystemInstruction({ reconnect: false })

/**
 * Event listeners for sending messages.
 */
sendButton.addEventListener("click", async () => {
  await handleSendMessage()
})
messageInput.addEventListener("keypress", async (event) => {
  if (event.key === "Enter") {
    await handleSendMessage()
  }
})

/**
 * On turn completion, save the conversation turn (user and assistant messages) to Mem0.
 */
client.on("turncomplete", async () => {
  isUsingTool = false
  logMessage("Turn complete", "system")
  
  // Finalize the current streaming message
  if (currentStreamingMessage) {
    finalizeStreamingMessage(currentStreamingMessage)
    currentStreamingMessage = null
  }

  // Finalize user transcript bubble for this turn
  if (currentUserTranscript) {
    finalizeStreamingMessage(currentUserTranscript)
    if (userTranscriptText && !lastUserMessage) {
      lastUserMessage = userTranscriptText
    }
    currentUserTranscript = null
  }
  // Prefer the spoken AI transcript over the raw modelTurn text for memory,
  // so saved memories match what the user actually heard.
  if (outputTranscriptText) {
    lastAssistantMessage = outputTranscriptText
  }
  userTranscriptText = ""
  outputTranscriptText = ""

  // User messages are already rendered immediately when sent.
  if (lastUserMessage && lastAssistantMessage) {
    // Save to localStorage (edge storage)
    saveConversationToHistory(lastUserMessage, lastAssistantMessage)
    
    if (CONFIG.PERFORMANCE?.ENABLE_MEMORY === true) {
      const userMessageToSave = lastUserMessage
      const assistantMessageToSave = lastAssistantMessage
      
      // Include user learning context in memory
      const userTopics = getUserTopics()
      const currentSession = getCurrentSession()
      
      const context = {
        userTopics: userTopics,
        recentSessionCount: getAllSessions().length,
        currentSessionTitle: currentSession?.title || "New conversation",
        timestamp: Date.now()
      }
      
      addMemory("default", [
        { role: "user", content: userMessageToSave },
        { role: "assistant", content: assistantMessageToSave },
        { role: "system", content: `User context: ${JSON.stringify(context)}` },
      ]).catch((error) => Logger.error("Error saving conversation to memory:", error))
    }
    lastUserMessage = ""
    lastAssistantMessage = ""
  }
})

/**
 * Accumulates assistant reply text and displays it in conversation.
 */
client.on("content", (data) => {
  if (data.modelTurn) {
    if (data.modelTurn.parts.some((part) => part.functionCall)) {
      isUsingTool = true
      Logger.info("Model is using a tool")
    } else if (data.modelTurn.parts.some((part) => part.functionResponse)) {
      isUsingTool = false
      Logger.info("Tool usage completed")
      
      // Check if the response is from document_generator
      const functionResponse = data.modelTurn.parts.find((part) => part.functionResponse)
      if (functionResponse && functionResponse.functionResponse) {
        const response = functionResponse.functionResponse.output
        if (response && response.success && response.document) {
          addDocumentArtifact(response.document, response.title)
          logMessage(`Document created: ${response.title}`, "ai")
        }
      }
    }
    const rawText = data.modelTurn.parts.map((part) => part.text).join("")
    const cleanedText = cleanAIResponse(rawText)
    if (cleanedText) {
      // Keep the full structured text in the system log + memory pipeline,
      // but DO NOT render it into the chat bubble — the chat shows only what
      // the AI actually speaks aloud (driven by outputAudioTranscription).
      logMessage(cleanedText, "ai")
      lastAssistantMessage = cleanedText
    }
  }
})

// === Live transcription rendering ===
// User mic transcript -> a streaming user bubble.
// AI output transcript -> appended into the current AI streaming bubble (used as
// captions when responseModalities is ["AUDIO"] only).
let currentUserTranscript = null
let userTranscriptText = ""
let outputTranscriptText = ""

client.on("inputtranscription", (payload) => {
  const delta = payload?.text || ""
  if (!delta) return
  userTranscriptText += delta
  if (!currentUserTranscript) {
    currentUserTranscript = addStreamingMessage("", "user")
  }
  updateStreamingMessage(currentUserTranscript, userTranscriptText)
})

client.on("outputtranscription", (payload) => {
  const delta = payload?.text || ""
  if (!delta) return
  outputTranscriptText += delta
  // The AI bubble shows ONLY what the model actually says out loud —
  // structured/wrapped text from modelTurn is intentionally ignored here.
  if (!currentStreamingMessage) {
    currentStreamingMessage = addStreamingMessage("")
  }
  updateStreamingMessage(currentStreamingMessage, outputTranscriptText)
})

client.on("open", () => {
  logMessage("WebSocket connection opened", "system")
})
client.on("log", (log) => {
  logMessage(`${log.type}: ${JSON.stringify(log.message)}`, "system")
})
client.on("close", (event) => {
  logMessage(`WebSocket connection closed (code ${event.code})`, "system")
})
client.on("audio", async (data) => {
    console.log("AUDIO EVENT:", data instanceof ArrayBuffer ? data.byteLength + " bytes" : typeof data);
  try {
    const streamer = await ensureAudioInitialized()
    const audioData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    streamer.addPCM16(audioData)
    // analyser-driven loop will animate the bars from the actual playback signal
  } catch (error) {
    logMessage(`Error processing audio: ${error.message}`, "system")
  }
})
client.on("interrupted", () => {
  audioStreamer?.stop()
  isUsingTool = false
  Logger.info("Model interrupted")
  logMessage("Model interrupted", "system")
  
  // Finalize streaming message on interruption
  if (currentStreamingMessage) {
    finalizeStreamingMessage(currentStreamingMessage)
    currentStreamingMessage = null
  }
  if (currentUserTranscript) {
    finalizeStreamingMessage(currentUserTranscript)
    currentUserTranscript = null
  }
  userTranscriptText = ""
  outputTranscriptText = ""
})
client.on("setupcomplete", () => {
  logMessage("Setup complete", "system")
})
client.on("error", (error) => {
  if (error instanceof ApplicationError) {
    Logger.error(`Application error: ${error.message}`, error)
  } else {
    Logger.error("Unexpected error", error)
  }
  logMessage(`Error: ${error.message}`, "system")
})
client.on("message", (message) => {
  if (message.error) {
    Logger.error("Server error:", message.error)
    logMessage(`Server error: ${message.error}`, "system")
  }
})

micButton.addEventListener("click", handleMicToggle)
connectButton.addEventListener("click", () => {
  if (isConnected) {
    disconnectFromWebsocket()
  } else {
    connectToWebsocket()
  }
})
messageInput.disabled = true
sendButton.disabled = true
micButton.disabled = true
setConnectButtonLabel("Connect", false)

/**
 * Handles the video toggle. Starts or stops video streaming.
 */
async function handleVideoToggle() {
  Logger.info("Video toggle clicked, current state:", { isVideoActive, isConnected })
  if (!isVideoActive) {
    try {
      Logger.info("Attempting to start video")
      if (isScreenSharing) stopScreenSharing()
      if (!videoManager) {
        videoManager = new VideoManager()
      }
      await videoManager.start((frameData) => {
        if (isConnected) {
          client.sendRealtimeInput([frameData])
        }
      })
      isVideoActive = true
      cameraIcon.className = "ph-fill ph-video-camera"
      cameraButton.classList.add("active-cam")
      screenButton.classList.remove("active-screen")
      setMediaLayerState("camera")
      pipWindow.style.display = "none"
      // Show flip camera button
      flipCameraButton.classList.remove("hidden")
      Logger.info("Camera started successfully")
      logMessage("Camera started", "system")
    } catch (error) {
      Logger.error("Camera error:", error)
      logMessage(`Error: ${error.message}`, "system")
      isVideoActive = false
      videoManager = null
      cameraIcon.className = "ph ph-video-camera"
      cameraButton.classList.remove("active-cam")
      setMediaLayerState(null)
    }
  } else {
    Logger.info("Stopping video")
    stopVideo()
  }
}

/**
 * Stops the video streaming.
 */
function stopVideo() {
  if (videoManager) {
    videoManager.stop()
    videoManager = null
  }
  isVideoActive = false
  cameraIcon.className = "ph ph-video-camera"
  cameraButton.classList.remove("active-cam")
  setMediaLayerState(isScreenSharing ? "screen" : null)
  // Hide flip camera button
  flipCameraButton.classList.add("hidden")
  logMessage("Camera stopped", "system")
}

/**
 * Handles flipping between front and back cameras.
 */
async function handleCameraFlip() {
  if (!videoManager || !isVideoActive) {
    Logger.warn("Cannot flip camera: video not active")
    return
  }

  try {
    Logger.info("Flipping camera")
    await videoManager.flipCamera()
    logMessage("Camera flipped", "system")
  } catch (error) {
    Logger.error("Camera flip error:", error)
    logMessage(`Error flipping camera: ${error.message}`, "system")
  }
}

cameraButton.addEventListener("click", handleVideoToggle)
flipCameraButton.addEventListener("click", handleCameraFlip)
stopVideoButton.addEventListener("click", stopVideo)
cameraButton.disabled = true

/**
 * Handles the screen share toggle. Starts or stops screen sharing.
 */
async function handleScreenShare() {
  if (!isScreenSharing) {
    try {
      if (isVideoActive) stopVideo()
      screenContainer.style.display = "block"
      screenRecorder = new ScreenRecorder()
      await screenRecorder.start(screenPreview, (frameData) => {
        if (isConnected) {
          client.sendRealtimeInput([
            {
              mimeType: "image/jpeg",
              data: frameData,
            },
          ])
        }
      })
      isScreenSharing = true
      screenIcon.className = "ph-fill ph-screencast"
      screenButton.classList.add("active-screen")
      cameraButton.classList.remove("active-cam")
      cameraIcon.className = "ph ph-video-camera"
      setMediaLayerState("screen")
      Logger.info("Screen sharing started")
      logMessage("Screen sharing started", "system")
    } catch (error) {
      Logger.error("Screen sharing error:", error)
      logMessage(`Error: ${error.message}`, "system")
      isScreenSharing = false
      screenIcon.className = "ph ph-screencast"
      screenButton.classList.remove("active-screen")
      setMediaLayerState(null)
      screenContainer.style.display = "none"
    }
  } else {
    stopScreenSharing()
  }
}

/**
 * Stops the screen sharing.
 */
function stopScreenSharing() {
  if (screenRecorder) {
    screenRecorder.stop()
    screenRecorder = null
  }
  isScreenSharing = false
  screenIcon.className = "ph ph-screencast"
  screenButton.classList.remove("active-screen")
  setMediaLayerState(isVideoActive ? "camera" : null)
  screenContainer.style.display = "none"
  logMessage("Screen sharing stopped", "system")
}

screenButton.addEventListener("click", handleScreenShare)
screenButton.disabled = true


// ============================================================
// === Authentication (Firebase) ==============================
// ============================================================
let authMode = "signin" // or "signup"
let currentUser = null
let authScreenEl = document.getElementById("auth-screen")
let setAuthModeUI = (mode) => {
  authMode = mode
}
let setAuthErrorUI = () => {}
const firebaseConfigEnvNames = {
  apiKey: "BEATRICE_FIREBASE_API_KEY",
  authDomain: "BEATRICE_FIREBASE_AUTH_DOMAIN",
  databaseURL: "BEATRICE_FIREBASE_DATABASE_URL",
  projectId: "BEATRICE_FIREBASE_PROJECT_ID",
  appId: "BEATRICE_FIREBASE_APP_ID",
}

function firebaseConfigErrorMessage() {
  const missing = firebaseMissingConfigKeys?.length
    ? firebaseMissingConfigKeys.map((key) => firebaseConfigEnvNames[key] || key).join(", ")
    : "runtime env"
  return `Firebase is not configured. Set ${missing} in js/config/env.js and redeploy.`
}

function shouldUseGoogleRedirectFallback(error) {
  const code = error?.code || ""
  const message = `${error?.message || ""}`.toLowerCase()
  return [
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(code) || message.includes("popup")
}

async function applyGoogleCredential(cred) {
  if (!cred?.user || !db) return

  const token = getGoogleAccessTokenFromCredential(cred)
  if (token && client?.setGoogleAccessToken) {
    storeGoogleOAuthAccessToken(token)
    client.setGoogleAccessToken(token)
    logMessage("Google API tools enabled", "system")
  } else if (CONFIG.GOOGLE_TOOLS.ENABLED) {
    logMessage("Google sign-in worked, but Google API tools need re-authorization", "system")
  }

  const userRef = ref(db, `users/${cred.user.uid}`)
  const snap = await get(userRef)
  if (!snap.exists()) {
    await set(userRef, {
      email: cred.user.email,
      displayName: cred.user.displayName || "",
      photoURL: cred.user.photoURL || "",
      createdAt: Date.now(),
    })
  }
}

// Initialize auth elements when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const authScreen = document.getElementById("auth-screen")
  const authBgGlow = document.getElementById("auth-bg-glow")
  const authCard = document.getElementById("auth-card")
  const authLogo = document.getElementById("auth-logo")
  const authTitle = document.getElementById("auth-title")
  const authSubtitle = document.getElementById("auth-subtitle")
  const authForm = document.getElementById("auth-form")
  const authNameInput = document.getElementById("auth-name")
  const authEmailInput = document.getElementById("auth-email")
  const authPasswordInput = document.getElementById("auth-password")
  const authConfirmPasswordInput = document.getElementById("auth-confirm-password")
  const authSubmit = document.getElementById("auth-submit")
  const authSubmitBtn = document.getElementById("auth-submit")
  const authSubmitText = document.querySelector(".auth-submit-text")
  const authErrorEl = document.getElementById("auth-error")
  const authToggleBtn = document.getElementById("auth-toggle-mode")
  const authGoogleBtn = document.getElementById("auth-google")
  const authGoogleRedirectBtn = document.getElementById("auth-google-redirect")
  const authForgotBtn = document.getElementById("auth-forgot")
  authScreenEl = authScreen

  // Debug: Log which auth elements were found
  Logger.info("Auth elements found:", {
    authScreen: !!authScreen,
    authForm: !!authForm,
    authToggleBtn: !!authToggleBtn,
    authGoogleBtn: !!authGoogleBtn,
    authConfirmPasswordInput: !!authConfirmPasswordInput
  })

  function setAuthMode(mode) {
    authMode = mode
    if (mode === "signup") {
      authScreen.classList.add("signup-mode")
      authSubtitle.textContent = "Create your account"
      authSubmitText.textContent = "Sign up"
      authToggleBtn.innerHTML = `Already have an account? <strong>Sign in</strong>`
      authPasswordInput.setAttribute("autocomplete", "new-password")
    } else {
      authScreen.classList.remove("signup-mode")
      authSubtitle.textContent = "Sign in to start automating"
      authSubmitText.textContent = "Sign in"
      authToggleBtn.innerHTML = `Don't have an account? <strong>Sign up</strong>`
      authPasswordInput.setAttribute("autocomplete", "current-password")
    }
    setAuthError("")
  }

  function setAuthError(msg, success = false) {
    if (!authErrorEl) return
    authErrorEl.textContent = msg || ""
    authErrorEl.classList.toggle("success", !!success && !!msg)
  }

  setAuthModeUI = setAuthMode
  setAuthErrorUI = setAuthError

  function prettyAuthError(err) {
    const code = err?.code || ""
    const map = {
      "auth/invalid-email": "That email doesn't look right.",
      "auth/user-not-found": "No account found with that email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Invalid email or password.",
      "auth/email-already-in-use": "An account with that email already exists.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/popup-closed-by-user": "Sign-in cancelled.",
      "auth/popup-blocked": "Popup was blocked. Redirecting to Google sign-in...",
      "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication settings.",
      "auth/operation-not-allowed": "Google sign-in is not enabled in Firebase Authentication.",
      "auth/network-request-failed": "Network error. Check your connection.",
    }
    return map[code] || err?.message || "Something went wrong. Try again."
  }

  function prefersRedirectSignIn() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true
  }

  startGoogleAuthFlow = async ({ redirectOnly = false } = {}) => {
    if (!auth || !db) {
      setAuthError(firebaseConfigErrorMessage())
      return
    }

    if (redirectOnly || prefersRedirectSignIn()) {
      setAuthError("Opening Google sign-in full page...", true)
      await signInWithRedirect(auth, googleProvider)
      return
    }

    setAuthError("Opening Google sign-in...", true)
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await applyGoogleCredential(cred)
      setAuthError("")
    } catch (err) {
      if (shouldUseGoogleRedirectFallback(err)) {
        Logger.warn("Google popup unavailable, falling back to redirect:", err)
        setAuthError("Opening Google sign-in full page...", true)
        await signInWithRedirect(auth, googleProvider)
        return
      }
      setAuthError(prettyAuthError(err))
    }
  }

  authToggleBtn?.addEventListener("click", () => {
    Logger.info("Auth toggle button clicked, current mode:", authMode)
    setAuthMode(authMode === "signin" ? "signup" : "signin")
  })

  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (!auth || !db) {
      setAuthError(firebaseConfigErrorMessage())
      return
    }

    const email = authEmailInput.value.trim()
    const password = authPasswordInput.value
    if (!email || !password) {
      setAuthError("Please enter your email and password.")
      return
    }
    if (authMode === "signup") {
      const confirmPassword = authConfirmPasswordInput.value
      if (password !== confirmPassword) {
        setAuthError("Passwords do not match.")
        return
      }
    }
    authSubmitBtn.disabled = true
    setAuthError("")
    try {
      if (authMode === "signup") {
        const name = authNameInput.value.trim()
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name) await updateProfile(cred.user, { displayName: name })
        // Seed profile in DB
        await set(ref(db, `users/${cred.user.uid}`), {
          email: cred.user.email,
          displayName: name || "",
          createdAt: Date.now(),
        })
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setAuthError(prettyAuthError(err))
    } finally {
      authSubmitBtn.disabled = false
    }
  })

  authGoogleBtn?.addEventListener("click", async () => {
    Logger.info("Google Auth button clicked")
    await startGoogleAuthFlow()
  })

  authGoogleRedirectBtn?.addEventListener("click", async () => {
    Logger.info("Google Auth full-page button clicked")
    await startGoogleAuthFlow({ redirectOnly: true })
  })

  authForgotBtn?.addEventListener("click", async () => {
    if (!auth) {
      setAuthError(firebaseConfigErrorMessage())
      return
    }

    const email = authEmailInput.value.trim()
    if (!email) {
      setAuthError("Enter your email above first.")
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      setAuthError("Reset link sent. Check your inbox.", true)
    } catch (err) {
      setAuthError(prettyAuthError(err))
    }
  })

  if (!auth || !db) {
    setAuthError(firebaseConfigErrorMessage())
    if (authSubmitBtn) authSubmitBtn.disabled = true
    if (authGoogleBtn) authGoogleBtn.disabled = true
    if (authGoogleRedirectBtn) authGoogleRedirectBtn.disabled = true
    if (authForgotBtn) authForgotBtn.disabled = true
  } else {
    getRedirectResult(auth)
      .then(async (cred) => {
        if (!cred) return
        await applyGoogleCredential(cred)
        setAuthError("")
      })
      .catch((err) => {
        Logger.error("Google redirect sign-in failed:", err)
        setAuthError(prettyAuthError(err))
      })
  }
})

// ============================================================
// === Profile Page ===========================================
// ============================================================
const profilePanel = document.getElementById("profile-panel")
const profileClose = document.getElementById("profile-close")
const profileSave = document.getElementById("profile-save")
const profileAvatar = document.getElementById("profile-avatar")
const profileAvatarEdit = document.getElementById("profile-avatar-edit")
const profileAvatarInput = document.getElementById("profile-avatar-input")
const profileDisplayNameLabel = document.getElementById("profile-display-name")
const profileEmailDisplay = document.getElementById("profile-email-display")
const profileNameInput = document.getElementById("profile-name")
const profileEmailInput = document.getElementById("profile-email")
const profileBirthdayInput = document.getElementById("profile-birthday")
const profileBioInput = document.getElementById("profile-bio")
const profileInterestInput = document.getElementById("profile-interest-input")
const profileInterestsContainer = document.getElementById("profile-interests")
const profileSignoutBtn = document.getElementById("profile-signout")

let profileData = {
  displayName: "",
  email: "",
  birthday: "",
  bio: "",
  interests: [],
  photoURL: "",
}

const FALLBACK_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%236366F1'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='96' height='96' fill='url(%23g)'/%3E%3Ccircle cx='48' cy='38' r='16' fill='white' fill-opacity='0.85'/%3E%3Cpath d='M16 88 c0 -20 14 -32 32 -32 s32 12 32 32' fill='white' fill-opacity='0.85'/%3E%3C/svg%3E"

function renderInterests() {
  if (!profileInterestsContainer) return
  profileInterestsContainer.innerHTML = ""
  profileData.interests.forEach((interest, idx) => {
    const chip = document.createElement("span")
    chip.className = "interest-chip"
    chip.innerHTML = `${interest}<button aria-label="Remove ${interest}"><i class="ph ph-x"></i></button>`
    chip.querySelector("button").addEventListener("click", () => {
      profileData.interests.splice(idx, 1)
      renderInterests()
    })
    profileInterestsContainer.appendChild(chip)
  })
}

function fillProfileUI() {
  profileNameInput.value = profileData.displayName || ""
  profileEmailInput.value = profileData.email || ""
  profileBirthdayInput.value = profileData.birthday || ""
  profileBioInput.value = profileData.bio || ""
  profileAvatar.src = profileData.photoURL || FALLBACK_AVATAR
  profileDisplayNameLabel.textContent = profileData.displayName || "—"
  profileEmailDisplay.textContent = profileData.email || ""
  renderInterests()
}

async function loadProfile(user) {
  if (!user) return
  profileData.email = user.email || ""
  profileData.displayName = user.displayName || ""
  profileData.photoURL = user.photoURL || ""
  try {
    const snap = await get(ref(db, `users/${user.uid}`))
    if (snap.exists()) {
      const v = snap.val() || {}
      profileData = {
        displayName: v.displayName || profileData.displayName,
        email: v.email || profileData.email,
        birthday: v.birthday || "",
        bio: v.bio || "",
        interests: Array.isArray(v.interests) ? v.interests : [],
        photoURL: v.photoURL || profileData.photoURL,
      }
    }
  } catch (err) {
    Logger.warn?.("Failed to load profile", err)
  }
  fillProfileUI()
}

async function saveProfile() {
  if (!currentUser) return
  profileData.displayName = profileNameInput.value.trim()
  profileData.birthday = profileBirthdayInput.value
  profileData.bio = profileBioInput.value.trim()
  try {
    await update(ref(db, `users/${currentUser.uid}`), {
      displayName: profileData.displayName,
      birthday: profileData.birthday,
      bio: profileData.bio,
      interests: profileData.interests,
      photoURL: profileData.photoURL,
      email: profileData.email,
      updatedAt: Date.now(),
    })
    if (profileData.displayName !== currentUser.displayName) {
      await updateProfile(currentUser, { displayName: profileData.displayName })
    }
    profileSave.classList.add("saved")
    profileSave.textContent = "Saved"
    setTimeout(() => {
      profileSave.classList.remove("saved")
      profileSave.textContent = "Save"
    }, 1400)
    fillProfileUI()
  } catch (err) {
    Logger.error("Profile save failed", err)
    logMessage(`Profile save failed: ${err.message}`, "system")
  }
}

function openProfile() {
  profilePanel.classList.add("open")
  profilePanel.setAttribute("aria-hidden", "false")
}
function closeProfile() {
  profilePanel.classList.remove("open")
  profilePanel.setAttribute("aria-hidden", "true")
}

profileClose?.addEventListener("click", closeProfile)
profileSave?.addEventListener("click", saveProfile)

// Avatar upload — store as base64 (downscaled) in Firebase RTDB
profileAvatarEdit?.addEventListener("click", () => profileAvatarInput?.click())
profileAvatarInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    logMessage('Please select an image file', 'system')
    return
  }
  
  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    logMessage('Image must be less than 5MB', 'system')
    return
  }
  
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    // Downscale to 256px square to keep DB payload small
    const img = new Image()
    img.src = dataUrl
    await new Promise((res) => { img.onload = res })
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    const scale = Math.max(size / img.width, size / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    profileData.photoURL = canvas.toDataURL("image/jpeg", 0.85)
    profileAvatar.src = profileData.photoURL
    logMessage('Avatar updated - click Save to save to Firebase RTDB', 'system')
  } catch (err) {
    Logger.error("Avatar processing failed", err)
    logMessage('Failed to process avatar image', 'system')
  }
  e.target.value = ""
})

// Add interests on Enter
profileInterestInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return
  e.preventDefault()
  const value = profileInterestInput.value.trim()
  if (!value) return
  if (!profileData.interests.includes(value)) {
    profileData.interests.push(value)
    renderInterests()
  }
  profileInterestInput.value = ""
})

profileSignoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth)
  } catch (err) {
    Logger.error("Sign out failed", err)
  }
})

// ============================================================
// === History Panel =========================================
// ============================================================
const historyPanel = document.getElementById("history-panel")
const historyClose = document.getElementById("history-close")
const historyNewSession = document.getElementById("history-new-session")
const historySessions = document.getElementById("history-sessions")
const historyEmpty = document.getElementById("history-empty")
const historyStartChat = document.getElementById("history-start-chat")

function openHistory() {
  historyPanel.classList.add("open")
  historyPanel.setAttribute("aria-hidden", "false")
  renderHistorySessions()
}

function closeHistory() {
  historyPanel.classList.remove("open")
  historyPanel.setAttribute("aria-hidden", "true")
}

function renderHistorySessions() {
  const sessions = getAllSessions()
  
  if (sessions.length === 0) {
    historySessions.hidden = true
    historyEmpty.hidden = false
    return
  }
  
  historySessions.hidden = false
  historyEmpty.hidden = true
  historySessions.innerHTML = ""
  
  sessions.forEach(session => {
    const card = createSessionCard(session)
    historySessions.appendChild(card)
  })
}

function createSessionCard(session) {
  const card = document.createElement("div")
  card.className = "history-session-card"
  if (session.id === currentSessionId) {
    card.classList.add("active")
  }
  
  const date = new Date(session.updatedAt).toLocaleDateString()
  const time = new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  const lastMessage = session.messages.length > 0 
    ? session.messages[session.messages.length - 1].content
    : "No messages yet"
  
  card.innerHTML = `
    <div class="history-session-header">
      <div class="history-session-title">
        <span>${escapeFeatureHtml(session.title)}</span>
      </div>
      <div class="history-session-date">${date} ${time}</div>
    </div>
    <div class="history-session-preview">${escapeFeatureHtml(lastMessage)}</div>
    <div class="history-session-meta">
      <span><i class="ph ph-chat-circle"></i> ${session.messageCount} messages</span>
    </div>
  `
  
  card.addEventListener("click", () => {
    switchToSession(session.id)
    closeHistory()
  })
  
  return card
}

function switchToSession(sessionId) {
  setCurrentSession(sessionId)
  const session = getCurrentSession()
  
  // Clear current conversation display
  conversationContainer.innerHTML = ""
  
  // Load session messages
  if (session && session.messages) {
    session.messages.forEach(msg => {
      addConversationMessage(msg.content, msg.role === "assistant" ? "ai" : "user")
    })
  }
  
  // Update opening message if empty
  if (conversationContainer.children.length === 0) {
    const openingMessage = generateOpeningMessageFromHistory()
    addConversationMessage(openingMessage, "ai")
  }
  
  Logger.info(`Switched to session: ${sessionId}`)
}

function escapeHtml(text) {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

historyClose?.addEventListener("click", closeHistory)
historyNewSession?.addEventListener("click", () => {
  createNewSession()
  conversationContainer.innerHTML = ""
  const openingMessage = "Hey Boss! I'm Beatrice. Lets start automating your task?"
  addConversationMessage(openingMessage, "ai")
  renderHistorySessions()
  closeHistory()
})

historyStartChat?.addEventListener("click", () => {
  createNewSession()
  conversationContainer.innerHTML = ""
  const openingMessage = "Hey Boss! I'm Beatrice. Lets start automating your task?"
  addConversationMessage(openingMessage, "ai")
  renderHistorySessions()
  closeHistory()
})

// Initialize current session on load
const savedSessionId = localStorage.getItem("current_session_id")
if (savedSessionId) {
  setCurrentSession(savedSessionId)
} else {
  createNewSession()
}

// ============================================================
// === PWA Install Banner =====================================
// ============================================================
let deferredPrompt = null
const pwaInstallBanner = document.getElementById('pwa-install-banner')
const pwaInstallDismiss = document.getElementById('pwa-install-dismiss')
const pwaInstallConfirm = document.getElementById('pwa-install-confirm')

// Check if user has already dismissed or installed
const pwaInstallDismissed = localStorage.getItem('pwa_install_dismissed')
const pwaInstalled = localStorage.getItem('pwa_installed')

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        Logger.info('Service Worker registered:', registration)
      })
      .catch(error => {
        Logger.error('Service Worker registration failed:', error)
      })
  })
}

// Listen for beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  
  // Show banner if not dismissed and not installed
  if (!pwaInstallDismissed && !pwaInstalled && pwaInstallBanner) {
    pwaInstallBanner.classList.remove('hidden')
  }
})

// Handle install button click
pwaInstallConfirm?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    
    if (outcome === 'accepted') {
      localStorage.setItem('pwa_installed', 'true')
      Logger.info('PWA installed')
    }
  }
  
  if (pwaInstallBanner) {
    pwaInstallBanner.classList.add('hidden')
  }
})

// Handle dismiss button click
pwaInstallDismiss?.addEventListener('click', () => {
  localStorage.setItem('pwa_install_dismissed', 'true')
  if (pwaInstallBanner) {
    pwaInstallBanner.classList.add('hidden')
  }
})

// Listen for app installed event
window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwa_installed', 'true')
  if (pwaInstallBanner) {
    pwaInstallBanner.classList.add('hidden')
  }
  Logger.info('PWA app installed')
})

// ============================================================
// === Auth state lifecycle ===================================
// ============================================================
if (auth) {
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user
    authScreenEl?.classList.add("hidden-screen")
    authScreenEl?.setAttribute("aria-hidden", "true")
    await loadProfile(user)
    await loadKnowledgeBaseForUser(user)
    
    // Set Google OAuth token for Workspace tools when this tab has one.
    const token = getStoredGoogleOAuthAccessToken()
    if (token) {
      client.setGoogleAccessToken(token)
      Logger.info("Google access token set for tools")
    } else if (CONFIG.GOOGLE_TOOLS.ENABLED) {
      Logger.info("Google Workspace tools need re-authorization to refresh OAuth access")
    }
    
    // Load persona names from localStorage or use defaults
    const savedPersonaName = localStorage.getItem("persona_name") || CONFIG.PERSONA.DEFAULT_NAME
    const savedUserName = localStorage.getItem("user_name") || CONFIG.PERSONA.DEFAULT_USER_NAME
    
    // Inject the user's name into the system instruction so the agent uses it
    if (profileData.displayName && !settingUserName.value) {
      settingUserName.value = profileData.displayName
      await applyRuntimeSystemInstruction({ reconnect: false })
    }
    
    // Display opening message based on conversation history
    const openingMessage = generateOpeningMessageFromHistory()
    addConversationMessage(openingMessage, "ai")
  } else {
    currentUser = null
    clearStoredGoogleOAuthAccessToken()
    closeProfile()
    closeSettings()
    authScreenEl?.classList.remove("hidden-screen")
    authScreenEl?.setAttribute("aria-hidden", "false")
    setAuthModeUI("signin")
    // Clean up websocket if any
    if (isConnected) await disconnectFromWebsocket()
  }
})
} else {
  currentUser = null
  authScreenEl?.classList.remove("hidden-screen")
  authScreenEl?.setAttribute("aria-hidden", "false")
  setAuthErrorUI(firebaseConfigErrorMessage())
  connectButton.disabled = true
}
