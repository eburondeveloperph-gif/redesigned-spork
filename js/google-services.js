/**
 * Google API Service Integrations
 * Provides access to Gmail, Drive, Calendar, and other Google services
 */

import { auth, getStoredGoogleOAuthAccessToken } from "./firebase.js"

/**
 * Get the current OAuth access token
 */
async function getAccessToken() {
  const user = auth?.currentUser
  if (!user) {
    throw new Error("User not authenticated")
  }

  const token = getStoredGoogleOAuthAccessToken()
  if (!token) {
    throw new Error("Google services need re-authorization")
  }

  return token
}

/**
 * Gmail API Service
 */
export const GmailService = {
  /**
   * List recent emails
   */
  async listEmails(maxResults = 10) {
    try {
      const token = await getAccessToken()
      const response = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.messages || []
    } catch (error) {
      console.error("Failed to list emails:", error)
      throw error
    }
  },

  /**
   * Get email details
   */
  async getEmail(messageId) {
    try {
      const token = await getAccessToken()
      const response = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to get email:", error)
      throw error
    }
  },

  /**
   * Send an email
   */
  async sendEmail(to, subject, body) {
    try {
      const token = await getAccessToken()
      
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
      ].join("\r\n")
      
      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
      
      const response = await fetch(
        "https://www.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "message/rfc822",
          },
          body: encodedEmail,
        }
      )
      
      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to send email:", error)
      throw error
    }
  },
}

/**
 * Google Drive API Service
 */
export const DriveService = {
  /**
   * List files in Drive
   */
  async listFiles(maxResults = 20) {
    try {
      const token = await getAccessToken()
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,createdTime,modifiedTime)`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Drive API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.files || []
    } catch (error) {
      console.error("Failed to list files:", error)
      throw error
    }
  },

  /**
   * Upload a file to Drive
   */
  async uploadFile(fileName, mimeType, content) {
    try {
      const token = await getAccessToken()
      
      const metadata = {
        name: fileName,
        mimeType: mimeType,
      }
      
      const form = new FormData()
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }))
      form.append("file", new Blob([content], { type: mimeType }))
      
      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      )
      
      if (!response.ok) {
        throw new Error(`Drive API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to upload file:", error)
      throw error
    }
  },

  /**
   * Create a folder in Drive
   */
  async createFolder(folderName) {
    try {
      const token = await getAccessToken()
      
      const metadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      }
      
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metadata),
        }
      )
      
      if (!response.ok) {
        throw new Error(`Drive API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to create folder:", error)
      throw error
    }
  },
}

/**
 * Google Calendar API Service
 */
export const CalendarService = {
  /**
   * List calendar events
   */
  async listEvents(maxResults = 10) {
    try {
      const token = await getAccessToken()
      const now = new Date().toISOString()
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${now}&orderBy=startTime&singleEvent=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.items || []
    } catch (error) {
      console.error("Failed to list events:", error)
      throw error
    }
  },

  /**
   * Create a calendar event
   */
  async createEvent(summary, description, startTime, endTime) {
    try {
      const token = await getAccessToken()
      
      const event = {
        summary: summary,
        description: description,
        start: {
          dateTime: startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }
      
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      )
      
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to create event:", error)
      throw error
    }
  },

  /**
   * Get available time slots (free/busy)
   */
  async getFreeBusy(timeMin, timeMax) {
    try {
      const token = await getAccessToken()
      
      const requestBody = {
        timeMin: timeMin,
        timeMax: timeMax,
        items: [{ id: "primary" }],
      }
      
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      )
      
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to get free/busy:", error)
      throw error
    }
  },
}

/**
 * Google Tasks API Service
 */
export const TasksService = {
  /**
   * List task lists
   */
  async listTaskLists() {
    try {
      const token = await getAccessToken()
      const response = await fetch(
        "https://www.googleapis.com/tasks/v1/users/@me/lists",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Tasks API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.items || []
    } catch (error) {
      console.error("Failed to list task lists:", error)
      throw error
    }
  },

  /**
   * List tasks in a task list
   */
  async listTasks(taskListId) {
    try {
      const token = await getAccessToken()
      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`Tasks API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.items || []
    } catch (error) {
      console.error("Failed to list tasks:", error)
      throw error
    }
  },

  /**
   * Create a new task
   */
  async createTask(taskListId, title, notes = "") {
    try {
      const token = await getAccessToken()
      
      const task = {
        title: title,
        notes: notes,
      }
      
      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(task),
        }
      )
      
      if (!response.ok) {
        throw new Error(`Tasks API error: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error("Failed to create task:", error)
      throw error
    }
  },
}

/**
 * Check if user has granted specific permissions
 */
export async function checkPermissions() {
  const user = auth?.currentUser
  const token = getStoredGoogleOAuthAccessToken()
  const disconnected = {
    gmail: false,
    drive: false,
    calendar: false,
    tasks: false,
  }

  if (!user || !token) return disconnected
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`
    )

    if (!response.ok) return disconnected

    const data = await response.json()
    const scopes = data.scope || ""
    
    return {
      gmail: scopes.includes("gmail"),
      drive: scopes.includes("drive"),
      calendar: scopes.includes("calendar"),
      tasks: scopes.includes("tasks"),
    }
  } catch (error) {
    console.error("Failed to check permissions:", error)
    return disconnected
  }
}
