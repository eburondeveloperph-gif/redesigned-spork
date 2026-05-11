// Security Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Save button
document.getElementById('security-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Re-authorize with Google button
document.getElementById('re-auth-google')?.addEventListener('click', async () => {
  try {
    const { signInWithPopup, auth, googleProvider, getGoogleAccessTokenFromCredential, storeGoogleOAuthAccessToken } = await import('./firebase.js')
    
    if (!auth) {
      alert('Firebase not initialized. Please refresh the main page first.')
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

// Check Google permissions
function checkGooglePermissions() {
  const services = ['gmail', 'drive', 'calendar', 'tasks']
  
  services.forEach(service => {
    const statusElement = document.getElementById(`${service}-status`)
    if (statusElement) {
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
