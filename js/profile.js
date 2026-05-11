// Profile Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Save button
document.getElementById('profile-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Avatar upload
document.getElementById('profile-avatar-edit')?.addEventListener('click', () => {
  document.getElementById('profile-avatar-input').click()
})

document.getElementById('profile-avatar-input')?.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      document.getElementById('profile-avatar').src = e.target.result
    }
    reader.readAsDataURL(file)
  }
})

// Interest chips
document.getElementById('profile-interest-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    const interest = e.target.value.trim()
    if (interest) {
      const interestsDiv = document.getElementById('profile-interests')
      const chip = document.createElement('div')
      chip.className = 'interest-chip'
      chip.innerHTML = `
        <span>${interest}</span>
        <button class="interest-chip-remove"><i class="ph ph-x"></i></button>
      `
      interestsDiv.appendChild(chip)
      e.target.value = ''
      
      // Remove chip on click
      chip.querySelector('.interest-chip-remove').addEventListener('click', () => {
        chip.remove()
      })
    }
  }
})

// Sign out
document.getElementById('profile-signout')?.addEventListener('click', () => {
  if (confirm('Are you sure you want to sign out?')) {
    localStorage.clear()
    window.location.href = 'index.html'
  }
})
