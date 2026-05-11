import {
  auth,
  db,
  onAuthStateChanged,
  ref,
  get,
  set,
} from "./firebase.js"

const KB_STORAGE_KEY = "eburon_knowledge_base"
const KB_MAX_BYTES = 10 * 1024 * 1024
const KB_MAX_TEXT_CHARS_PER_FILE = 45000
const KB_TEXT_TYPES = /^(text\/|application\/json$|application\/x-yaml$|application\/xml$)/
const KB_TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|tsv|yaml|yml|xml|html|css|js|ts|tsx|jsx|log)$/i

let currentUser = null
let knowledgeBase = []

const backButton = document.getElementById("back-button")
const saveButton = document.getElementById("knowledge-save")
const uploadButton = document.getElementById("kb-upload-btn")
const uploadInput = document.getElementById("kb-upload-input")
const kbList = document.getElementById("kb-list")
const searchInput = document.getElementById("kb-search")
const searchResults = document.getElementById("kb-search-results")

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
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
    .filter((term) => term.length >= 2)
}

function scoreKbEntry(entry, terms) {
  if (!terms.length) return 0
  const haystack = `${entry.name}\n${entry.text}`.toLowerCase()
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
}

function loadLocalKnowledgeBase() {
  try {
    knowledgeBase = sanitizeKnowledgeBase(JSON.parse(localStorage.getItem(KB_STORAGE_KEY) || "[]"))
  } catch {
    knowledgeBase = []
  }
}

async function persistKnowledgeBase() {
  knowledgeBase = sanitizeKnowledgeBase(knowledgeBase)
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(knowledgeBase))
  localStorage.setItem("eburon_knowledge_base_updated_at", String(Date.now()))

  if (!currentUser || !db) return
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
}

async function loadRemoteKnowledgeBase(user) {
  if (!user || !db) return
  try {
    const snap = await get(ref(db, `users/${user.uid}/knowledgeBase/files`))
    if (snap.exists()) {
      knowledgeBase = sanitizeKnowledgeBase(snap.val())
      localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(knowledgeBase))
    } else if (knowledgeBase.length) {
      await persistKnowledgeBase()
    }
  } catch (error) {
    renderStatus(`Firebase sync failed: ${error.message}`)
  }
}

function renderStatus(message) {
  if (!searchResults || !message) return
  searchResults.innerHTML = `<div class="kb-search-result"><p>${escapeHtml(message)}</p></div>`
}

function renderKbList() {
  if (!kbList) return
  kbList.innerHTML = ""

  if (!knowledgeBase.length) {
    const empty = document.createElement("div")
    empty.className = "kb-empty"
    empty.textContent = "No files uploaded yet."
    kbList.appendChild(empty)
    return
  }

  knowledgeBase.forEach((file, index) => {
    const status = file.indexed ? "indexed" : file.indexStatus || "not indexed"
    const item = document.createElement("div")
    item.className = "kb-item"
    item.innerHTML = `
      <span class="kb-item-icon"><i class="ph-fill ph-file-text"></i></span>
      <div class="kb-item-info">
        <span class="kb-item-name">${escapeHtml(file.name)}</span>
        <span class="kb-item-meta">${Math.round(file.size / 1024)} KB · ${escapeHtml(status)}</span>
      </div>
      <button class="kb-item-remove" type="button" aria-label="Remove ${escapeHtml(file.name)}">
        <i class="ph ph-x"></i>
      </button>
    `
    item.querySelector(".kb-item-remove")?.addEventListener("click", async () => {
      knowledgeBase.splice(index, 1)
      await persistKnowledgeBase()
      renderKbList()
      runSearch(searchInput?.value || "")
    })
    kbList.appendChild(item)
  })
}

function runSearch(query) {
  if (!searchResults) return
  const terms = getKbTerms(query)
  if (!terms.length) {
    searchResults.innerHTML = ""
    return
  }

  const matches = knowledgeBase
    .filter((entry) => entry.indexed && entry.text)
    .map((entry) => ({ entry, score: scoreKbEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.addedAt - a.entry.addedAt)
    .slice(0, 8)

  if (!matches.length) {
    searchResults.innerHTML = `<div class="kb-search-result"><strong>No indexed matches found.</strong><p>Upload text, PDF, or DOCX content with those terms.</p></div>`
    return
  }

  searchResults.innerHTML = matches.map(({ entry }) => {
    const lower = entry.text.toLowerCase()
    const hitIndex = Math.max(0, terms.map((term) => lower.indexOf(term)).filter((idx) => idx >= 0).sort((a, b) => a - b)[0] || 0)
    const snippet = entry.text.slice(Math.max(0, hitIndex - 80), hitIndex + 220)
    return `
      <div class="kb-search-result">
        <strong>${escapeHtml(entry.name)}</strong>
        <p>${escapeHtml(snippet)}${snippet.length >= 300 ? "..." : ""}</p>
      </div>
    `
  }).join("")
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

async function handleUpload(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  for (const file of files) {
    if (file.size > KB_MAX_BYTES) {
      renderStatus(`"${file.name}" exceeds 10MB and was skipped.`)
      continue
    }

    try {
      const extracted = await extractKnowledgeText(file)
      const text = normalizeKbText(extracted.text).slice(0, KB_MAX_TEXT_CHARS_PER_FILE)
      knowledgeBase.push({
        id: createKbId(file),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        text,
        indexed: Boolean(text),
        indexStatus: text ? extracted.status : extracted.reason || extracted.status || "not_indexed",
        addedAt: Date.now(),
      })
      renderStatus(text ? `Indexed "${file.name}".` : `Could not index "${file.name}".`)
    } catch (error) {
      renderStatus(`Upload failed for "${file.name}": ${error.message}`)
    }
  }

  await persistKnowledgeBase()
  renderKbList()
  runSearch(searchInput?.value || "")
  event.target.value = ""
}

backButton?.addEventListener("click", () => {
  window.location.href = "index.html?v=latest"
})

saveButton?.addEventListener("click", async () => {
  await persistKnowledgeBase()
  window.location.href = "index.html?v=latest"
})

uploadButton?.addEventListener("click", () => uploadInput?.click())
uploadInput?.addEventListener("change", handleUpload)
searchInput?.addEventListener("input", (event) => runSearch(event.target.value))

loadLocalKnowledgeBase()
renderKbList()

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user
    if (user) {
      await loadRemoteKnowledgeBase(user)
      renderKbList()
      runSearch(searchInput?.value || "")
    }
  })
}
