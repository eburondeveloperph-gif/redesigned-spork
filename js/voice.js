// Voice Page JavaScript
import { CONFIG } from './config/config.js'

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Voice card selection
const voiceCards = document.querySelectorAll('.voice-card')

// Mark currently selected voice on load
const savedVoice = localStorage.getItem('beatrice_voice')
if (savedVoice) {
  const selectedCard = document.querySelector(`.voice-card[data-voice="${savedVoice}"]`)
  if (selectedCard) {
    selectedCard.classList.add('selected')
  }
} else {
  // Mark default voice as selected
  const defaultCard = document.querySelector(`.voice-card[data-voice="Fenrir"]`)
  if (defaultCard) {
    defaultCard.classList.add('selected')
  }
}

// Handle voice selection
voiceCards.forEach(card => {
  card.addEventListener('click', () => {
    const voice = card.dataset.voice
    const heroName = card.querySelector('.voice-card-name').textContent
    
    // Update selected state
    voiceCards.forEach(c => c.classList.remove('selected'))
    card.classList.add('selected')
    
    // Save to localStorage
    localStorage.setItem('beatrice_voice', voice)
    localStorage.setItem('beatrice_voice_hero', heroName)
  })
})

// Save button
document.getElementById('voice-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})
