// Memory Page JavaScript

// Back button navigation
document.getElementById('back-button')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Save button
document.getElementById('memory-save')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// Add memory button
document.getElementById('memory-add')?.addEventListener('click', () => {
  const memoryType = document.getElementById('memory-type').value
  const memoryContent = document.getElementById('memory-content').value
  
  if (!memoryContent.trim()) {
    alert('Please enter memory content')
    return
  }
  
  // Add memory to list
  const memoryList = document.getElementById('memory-list')
  const emptyState = memoryList.querySelector('.memory-empty')
  
  if (emptyState) {
    emptyState.remove()
  }
  
  const memoryItem = document.createElement('div')
  memoryItem.className = 'memory-item'
  memoryItem.innerHTML = `
    <div class="memory-item-type">${memoryType}</div>
    <div class="memory-item-content">${memoryContent}</div>
    <div class="memory-item-meta">
      <span class="memory-item-date">${new Date().toLocaleDateString()}</span>
      <button class="memory-item-delete">
        <i class="ph ph-trash"></i>
      </button>
    </div>
  `
  memoryList.appendChild(memoryItem)
  
  // Clear input
  document.getElementById('memory-content').value = ''
  
  // Remove empty state
  const memoryEmpty = memoryList.querySelector('.memory-empty')
  if (memoryEmpty) {
    memoryEmpty.remove()
  }
})

// Sync memories button
document.getElementById('memory-sync')?.addEventListener('click', () => {
  const syncStatus = document.getElementById('memory-sync-status')
  syncStatus.textContent = 'Syncing memories...'
  
  // Simulate sync
  setTimeout(() => {
    syncStatus.textContent = 'Memories synced successfully'
    setTimeout(() => {
      syncStatus.textContent = ''
    }, 3000)
  }, 1500)
})

// Delete memory functionality
document.addEventListener('click', (e) => {
  if (e.target.closest('.memory-item-delete')) {
    const memoryItem = e.target.closest('.memory-item')
    memoryItem.remove()
    
    // Show empty state if no memories
    const memoryList = document.getElementById('memory-list')
    if (memoryList.children.length === 0) {
      memoryList.innerHTML = `
        <div class="memory-empty">
          <i class="ph ph-brain"></i>
          <p>No memories stored yet</p>
        </div>
      `
    }
  }
})
