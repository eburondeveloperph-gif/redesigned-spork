import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Google Tasks operations.
 * Allows the agent to manage task lists and tasks.
 */
export class TasksTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Tasks API calls.
     * @param {string} token - The OAuth access token.
     */
    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'tasks',
            description: 'Manage Google Tasks like creating, reading, updating, deleting, and listing tasks',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: create, read, update, delete, list, list_tasklists',
                        enum: ['create', 'read', 'update', 'delete', 'list', 'list_tasklists']
                    },
                    tasklistId: {
                        type: 'string',
                        description: 'Task list ID (defaults to "@default" if not provided)'
                    },
                    taskId: {
                        type: 'string',
                        description: 'Task ID for read, update, delete actions'
                    },
                    title: {
                        type: 'string',
                        description: 'Task title (for create/update)'
                    },
                    notes: {
                        type: 'string',
                        description: 'Task notes (for create/update)'
                    },
                    due: {
                        type: 'string',
                        description: 'Task due date in ISO format (for create/update)'
                    },
                    status: {
                        type: 'string',
                        description: 'Task status (for update): "needsAction" or "completed"'
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Tasks operation.
     */
    async execute(args) {
        try {
            const { action, tasklistId = '@default', taskId, title, notes, due, status } = args;
            
            if (!this.accessToken) {
                throw new Error('Tasks access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'create':
                    return await this.createTask(tasklistId, title, notes, due);
                case 'read':
                    return await this.readTask(tasklistId, taskId);
                case 'update':
                    return await this.updateTask(tasklistId, taskId, title, notes, due, status);
                case 'delete':
                    return await this.deleteTask(tasklistId, taskId);
                case 'list':
                    return await this.listTasks(tasklistId);
                case 'list_tasklists':
                    return await this.listTaskLists();
                default:
                    throw new Error(`Unknown Tasks action: ${action}`);
            }
        } catch (error) {
            Logger.error('Tasks tool execution failed', error);
            throw error;
        }
    }

    /**
     * Creates a new task.
     */
    async createTask(tasklistId, title, notes, due) {
        const task = {
            title: title || 'Untitled Task'
        };

        if (notes) task.notes = notes;
        if (due) task.due = due;

        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create task: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.id, title: data.title };
    }

    /**
     * Reads a specific task.
     */
    async readTask(tasklistId, taskId) {
        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to read task: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.id,
            title: data.title,
            notes: data.notes,
            due: data.due,
            status: data.status,
            completed: data.completed
        };
    }

    /**
     * Updates an existing task.
     */
    async updateTask(tasklistId, taskId, title, notes, due, status) {
        const task = {};
        
        if (title) task.title = title;
        if (notes !== undefined) task.notes = notes;
        if (due) task.due = due;
        if (status) task.status = status;

        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update task: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.id };
    }

    /**
     * Deletes a task.
     */
    async deleteTask(tasklistId, taskId) {
        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete task: ${response.statusText}`);
        }
        
        return { success: true };
    }

    /**
     * Lists tasks in a task list.
     */
    async listTasks(tasklistId) {
        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks?showCompleted=false&showHidden=false&maxResults=20`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list tasks: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            items: data.items || []
        };
    }

    /**
     * Lists user's task lists.
     */
    async listTaskLists() {
        const response = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list task lists: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            items: data.items || []
        };
    }
}
