// History Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// New session button
document.getElementById('history-new-session')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Start chat button
document.getElementById('history-start-chat')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Load history sessions
function loadHistorySessions() {
  const historySessions = document.getElementById('history-sessions')
  const historyEmpty = document.getElementById('history-empty')
  
  // Get sessions from localStorage
  const sessions = JSON.parse(localStorage.getItem('beatrice_sessions') || '[]')
  
  if (sessions.length === 0) {
    historySessions.innerHTML = ''
    historyEmpty.hidden = false
    return
  }
  
  historyEmpty.hidden = true
  
  historySessions.innerHTML = sessions.map(session => `
    <div class="history-session" data-session-id="${session.id}">
      <div class="history-session-header">
        <div class="history-session-title">${session.title || 'Untitled Session'}</div>
        <div class="history-session-date">${new Date(session.date).toLocaleDateString()}</div>
      </div>
      <div class="history-session-preview">${session.preview || 'No preview available'}</div>
      <div class="history-session-actions">
        <button class="history-session-continue" data-session-id="${session.id}">
          <i class="ph ph-arrow-right"></i>
          <span>Continue</span>
        </button>
      </div>
    </div>
  `).join('')
  
  // Add click handlers for continue buttons
  historySessions.querySelectorAll('.history-session-continue').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId
      localStorage.setItem('beatrice_current_session', sessionId)
      window.location.href = 'index.html'
    })
  })
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadHistorySessions()
})
