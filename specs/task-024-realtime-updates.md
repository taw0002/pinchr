# Real-Time UI Updates via File Watcher (task-024)

## Goal
When the agent (or any external process) modifies workspace data files (tasks.json, automations, MCP config), the Pinchr UI should update immediately without requiring the user to navigate away and back.

## Architecture

### Main Process: File Watcher
In the Electron main process, use `fs.watch` (or `chokidar` if already available) to watch key workspace files.

File: `src/main/fileWatcher.ts` (new)

```ts
// Watch these workspace files for changes
const WATCHED_FILES = [
  'tasks.json',
  // Future: 'automations.json', 'mcp-config.json'
];

// On change, send IPC event to renderer
mainWindow.webContents.send('workspace:file-changed', { 
  file: relativePath,
  timestamp: Date.now() 
});
```

### Preload: Expose IPC listener
In `src/preload/index.ts`, expose a listener:
```ts
workspace: {
  onFileChanged: (callback: (data: { file: string; timestamp: number }) => void) => {
    ipcRenderer.on('workspace:file-changed', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('workspace:file-changed');
  }
}
```

### Renderer: Hook into useTasks
In `src/renderer/src/hooks/useTasks.ts`:
- Listen for `workspace:file-changed` events where `file === 'tasks.json'`
- On change, reload tasks from disk
- Use a debounce (200ms) to avoid rapid-fire reloads during bulk writes

```ts
useEffect(() => {
  const cleanup = window.api.workspace.onFileChanged(({ file }) => {
    if (file === 'tasks.json') {
      // Debounced reload
      loadTasks();
    }
  });
  return cleanup;
}, []);
```

### Toast Notification (optional but nice)
When a task status changes to 'done' that wasn't triggered by the current user session, show a toast:
"✅ Task completed: {title}"

Use the existing toast/notification system if one exists, or add a simple one.

## Debouncing Strategy
- File watcher fires on every write — debounce to 200ms in main process before sending IPC
- Renderer also debounces reloads to prevent flicker
- Compare loaded data to current state to avoid unnecessary re-renders

## Files to Create
- `src/main/fileWatcher.ts` — file watcher setup and IPC events

## Files to Modify  
- `src/main/index.ts` — initialize file watcher on app ready
- `src/preload/index.ts` — expose `workspace.onFileChanged` API
- `src/renderer/src/hooks/useTasks.ts` — subscribe to file change events, auto-reload
- `src/shared/types.ts` — add workspace event types if needed

## Constraints
- Use Node.js built-in `fs.watch` (no new deps) — it's sufficient for single-file watching
- Debounce in main process (200ms) to avoid flooding renderer
- Only watch files that exist — don't crash if tasks.json is missing
- The watcher should be started after the workspace path is known (from gateway config)
- Clean up watchers on app quit

## Testing
- Modify tasks.json externally (e.g., from terminal) → UI should update within ~500ms
- Complete a task via agent → task board should show it as done without navigation
- Rapid writes (10 in 1 second) → should debounce to 1-2 reloads, not 10
