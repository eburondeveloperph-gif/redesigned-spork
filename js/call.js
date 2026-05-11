// Call Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Save button
document.getElementById('call-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Prepare call button
document.getElementById('call-prepare')?.addEventListener('click', () => {
  const recipient = document.getElementById('call-recipient').value
  const topic = document.getElementById('call-topic').value
  
  if (!recipient || !topic) {
    alert('Please enter recipient and discussion topic')
    return
  }
  
  // Show result section
  const resultSection = document.getElementById('call-result')
  resultSection.hidden = false
  
  // Generate talking points
  const talkingPoints = document.getElementById('call-talking-points')
  talkingPoints.innerHTML = `
    <ul>
      <li>Introduction: Introduce yourself and the purpose of the call</li>
      <li>Key points about: ${topic}</li>
      <li>Questions to ask: Prepare relevant questions for ${recipient}</li>
      <li>Next steps: Define action items and follow-up</li>
    </ul>
  `
  
  // Generate opening line
  const openingLine = document.getElementById('call-opening-line')
  openingLine.textContent = `"Hi ${recipient}, this is a call about ${topic}. Do you have a moment to discuss this?"`
})

// Sync contacts button
document.getElementById('sync-contacts')?.addEventListener('click', () => {
  const contactsStatus = document.getElementById('contacts-status')
  contactsStatus.textContent = 'Requesting contacts permission...'
  
  // Request contacts permission (simulated)
  setTimeout(() => {
    contactsStatus.textContent = 'Syncing contacts...'
    
    // Simulate sync process
    setTimeout(() => {
      // Generate sample contacts
      const sampleContacts = [
        { name: 'John Smith', phone: '+1 234-567-8901' },
        { name: 'Jane Doe', phone: '+1 234-567-8902' },
        { name: 'Mike Johnson', phone: '+1 234-567-8903' },
        { name: 'Sarah Williams', phone: '+1 234-567-8904' },
        { name: 'David Brown', phone: '+1 234-567-8905' }
      ]
      
      // Store contacts in localStorage
      localStorage.setItem('beatrice_contacts', JSON.stringify(sampleContacts))
      
      // Update UI
      contactsStatus.textContent = 'Contacts synced successfully!'
      setTimeout(() => {
        contactsStatus.textContent = ''
      }, 3000)
      
      // Render contacts list
      renderContactsList(sampleContacts)
    }, 1500)
  }, 500)
})

// Render contacts list
function renderContactsList(contacts) {
  const contactsList = document.getElementById('contacts-list')
  
  if (contacts.length === 0) {
    contactsList.innerHTML = `
      <div class="contacts-empty">
        <i class="ph ph-users"></i>
        <p>No contacts synced yet</p>
      </div>
    `
    return
  }
  
  contactsList.innerHTML = contacts.map(contact => `
    <div class="contact-item" data-name="${contact.name}" data-phone="${contact.phone}">
      <div class="contact-avatar">
        <i class="ph ph-user"></i>
      </div>
      <div class="contact-info">
        <div class="contact-name">${contact.name}</div>
        <div class="contact-phone">${contact.phone}</div>
      </div>
      <button class="contact-select" title="Select this contact">
        <i class="ph ph-plus"></i>
      </button>
    </div>
  `).join('')
  
  // Add click handlers for contact selection
  contactsList.querySelectorAll('.contact-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const contactItem = e.target.closest('.contact-item')
      const name = contactItem.dataset.name
      const phone = contactItem.dataset.phone
      
      // Fill the recipient field
      const recipientInput = document.getElementById('call-recipient')
      recipientInput.value = `${name} (${phone})`
    })
  })
}

// Load contacts on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedContacts = localStorage.getItem('beatrice_contacts')
  if (savedContacts) {
    try {
      const contacts = JSON.parse(savedContacts)
      renderContactsList(contacts)
    } catch (e) {
      console.error('Failed to load contacts:', e)
    }
  }
})
