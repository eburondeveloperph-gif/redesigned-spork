// Settings Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Save button
document.getElementById('settings-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Persona presets
document.querySelectorAll('.persona-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const persona = btn.dataset.persona
    const personaInput = document.getElementById('setting-persona')
    
    const presets = {
      warm: 'Warm, friendly, and conversational. Uses casual language and shows empathy.',
      professional: 'Professional, concise, and business-focused. Uses formal language and stays on topic.',
      playful: 'Playful, witty, and fun. Uses humor and casual language.',
      concise: 'Concise and direct. Gets straight to the point with minimal fluff.'
    }
    
    if (presets[persona]) {
      personaInput.value = presets[persona]
    }
  })
})

// Google re-authorize button
document.getElementById('google-reauth-btn')?.addEventListener('click', async () => {
  // Trigger Google OAuth re-authorization
  try {
    const { signInWithPopup, auth, googleProvider, getGoogleAccessTokenFromCredential, storeGoogleOAuthAccessToken } = await import('./firebase.js')
    
    if (!auth) {
      alert('Firebase not initialized. Please refresh the page.')
      return
    }
    
    const cred = await signInWithPopup(auth, googleProvider)
    const token = getGoogleAccessTokenFromCredential(cred)
    if (token) {
      storeGoogleOAuthAccessToken(token)
      alert('Google services re-authorized successfully!')
      checkGooglePermissions()
    }
  } catch (error) {
    console.error('Re-authorization failed:', error)
    alert('Re-authorization failed: ' + error.message)
  }
})

// Browser permission update helper
function updateBrowserPermissionUI(elementId, state) {
  const element = document.getElementById(elementId)
  if (!element) return
  
  const stateLabels = {
    'granted': 'Granted',
    'denied': 'Denied',
    'prompt': 'Ready',
    'unknown': 'Unknown'
  }
  
  element.textContent = stateLabels[state] || state
  element.className = 'permission-status ' + (state === 'granted' ? 'connected' : 'disconnected')
}

// Check browser permissions
async function checkBrowserPermissions() {
  // Check microphone permission
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const micResult = await navigator.permissions.query({ name: 'microphone' })
      updateBrowserPermissionUI('mic-permission-status', micResult.state)
      
      micResult.addEventListener('change', () => {
        updateBrowserPermissionUI('mic-permission-status', micResult.state)
      })
    } else {
      // Try to detect by checking if getUserMedia works
      updateBrowserPermissionUI('mic-permission-status', 'unknown')
    }
  } catch (e) {
    console.log('Microphone permission check not supported')
    updateBrowserPermissionUI('mic-permission-status', 'unknown')
  }

  // Check camera permission
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const camResult = await navigator.permissions.query({ name: 'camera' })
      updateBrowserPermissionUI('camera-permission-status', camResult.state)
      
      camResult.addEventListener('change', () => {
        updateBrowserPermissionUI('camera-permission-status', camResult.state)
      })
    } else {
      updateBrowserPermissionUI('camera-permission-status', 'unknown')
    }
  } catch (e) {
    console.log('Camera permission check not supported')
    updateBrowserPermissionUI('camera-permission-status', 'unknown')
  }

  // Screen share is always 'ready' until user initiates
  updateBrowserPermissionUI('screen-permission-status', 'prompt')
}

// Check Google permissions (mock implementation for standalone page)
function checkGooglePermissions() {
  // For the settings page standalone, we just show the elements
  const services = ['gmail', 'drive', 'calendar', 'tasks']
  
  services.forEach(service => {
    const statusElement = document.getElementById(`${service}-status`)
    if (statusElement) {
      // Check sessionStorage for Google auth token
      const hasToken = sessionStorage.getItem('google_oauth_token')
      if (hasToken) {
        statusElement.textContent = 'Connected'
        statusElement.className = 'permission-status connected'
      } else {
        statusElement.textContent = 'Not connected'
        statusElement.className = 'permission-status disconnected'
      }
    }
  })
}

// Initialize on page load
async function init() {
  checkGooglePermissions()
  await checkBrowserPermissions()
}

// Run initialization
init()
