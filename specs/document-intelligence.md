# Document Intelligence Spec — Pinchr

## Vision
Give Pinchr the ability to see, read, and edit documents that are open on the user's computer. No other AI assistant can reach into your actual Word docs, spreadsheets, or presentations and make changes. This is a Pro-tier differentiator.

## Architecture

### Tier 1 — System Awareness (Phase 1)
**Goal:** Know what apps are running and what files they have open.

**Main Process IPC Handlers:**
- `system.getRunningApps()` → list of foreground apps with PIDs
- `system.getOpenDocuments(app?: string)` → list of open document paths per app
- `system.getFrontmostApp()` → currently focused app + window title + document path

**Implementation:**
- AppleScript via `osascript` in Electron main process
- Pinchr.app gets Automation permission per-app (macOS prompts on first use)
- Expose through gateway as invocable tools

**AppleScript examples:**
```applescript
-- Get all open Word documents
tell application "Microsoft Word" to get full name of every document

-- Get all open Excel workbooks  
tell application "Microsoft Excel" to get full name of every workbook

-- Get all open PowerPoint presentations
tell application "Microsoft PowerPoint" to get full name of every presentation

-- Get frontmost app
tell application "System Events" to get name of first process whose frontmost is true
```

### Tier 2 — Document Read/Edit (Phase 2)
**Goal:** Read content from and write changes to Office documents programmatically.

**Supported Formats:**
| Format | Read Library | Write Library | Node-native? |
|--------|-------------|---------------|--------------|
| .docx  | docx (mammoth for reading) | docx | ✅ |
| .xlsx  | exceljs | exceljs | ✅ |
| .pptx  | pptxgenjs (create), officegen | pptxgenjs | ✅ |
| .pdf   | pdf-parse (read) | pdfkit (create) | ✅ |
| .csv   | papaparse | papaparse | ✅ |

**Preferred approach:** Use Node-native libraries bundled with Pinchr (no Python dependency).
**Fallback:** Shell out to python-docx/openpyxl/python-pptx for complex operations.

**Main Process IPC Handlers:**
- `document.read(filePath)` → structured content (text, paragraphs, styles, tables, etc.)
- `document.write(filePath, changes)` → apply changes and save
- `document.getMetadata(filePath)` → author, dates, page count, etc.
- `document.export(filePath, format)` → convert between formats

**Change operations for .docx:**
- `replaceText(find, replace)` — find and replace
- `formatParagraph(index, style)` — apply formatting (bold, underline, size, color)
- `insertParagraph(index, text, style)` — add new content
- `deleteParagraph(index)` — remove content
- `setDocumentStyle(template)` — apply consistent styling
- `addTable(index, data)` — insert a table
- `getComments()` / `addComment()` — review comments

**Change operations for .xlsx:**
- `readSheet(name)` → rows/columns with types
- `writeCell(sheet, cell, value)` — update a cell
- `addFormula(sheet, cell, formula)` — insert formulas
- `formatRange(sheet, range, style)` — apply formatting
- `addChart(sheet, config)` — create charts
- `addSheet(name)` / `deleteSheet(name)` — manage sheets

**Change operations for .pptx:**
- `getSlides()` → slide content and layout info
- `editSlideText(slideIndex, placeholder, text)` — update text
- `addSlide(layout, content)` — create new slides
- `setSlideBackground(slideIndex, config)` — backgrounds
- `addImage(slideIndex, imagePath, position)` — insert images

### Tier 3 — Live App Automation (Phase 3)
**Goal:** Control Word/Excel/PowerPoint directly via AppleScript for real-time editing.

**Use cases:**
- "Bold that paragraph" while looking at the doc
- "Add a new slide with this content" in the live presentation
- "Sort this column" in the open spreadsheet
- Template generation and mail merge
- "Format this whole doc like a professional proposal"

**Implementation:**
- AppleScript commands to Word/Excel/PowerPoint via Pinchr main process
- More precise than file editing — operates on the live document state
- User sees changes happen in real-time
- Requires Automation permission per app

### Gateway Integration
Expose all handlers as tools the agent can invoke:

```typescript
// In preload/index.ts — expose to renderer
contextBridge.exposeInMainWorld('api', {
  // ... existing handlers
  system: {
    getRunningApps: () => ipcRenderer.invoke('system:get-running-apps'),
    getOpenDocuments: (app?: string) => ipcRenderer.invoke('system:get-open-documents', app),
    getFrontmostApp: () => ipcRenderer.invoke('system:get-frontmost-app'),
  },
  document: {
    read: (path: string) => ipcRenderer.invoke('document:read', path),
    write: (path: string, changes: DocumentChanges) => ipcRenderer.invoke('document:write', path, changes),
    getMetadata: (path: string) => ipcRenderer.invoke('document:get-metadata', path),
  }
})

// In main/ipc.ts — handle in main process
ipcMain.handle('system:get-running-apps', async () => { /* osascript */ })
ipcMain.handle('system:get-open-documents', async (_, app) => { /* osascript */ })
ipcMain.handle('document:read', async (_, path) => { /* docx/exceljs/etc */ })
ipcMain.handle('document:write', async (_, path, changes) => { /* docx/exceljs/etc */ })
```

**Agent access:** The OpenClaw agent calls these through Pinchr's gateway proxy (`tools/invoke`), same as computer use.

## UI Components

### Document Viewer (future)
- Show open documents in sidebar or dashboard
- Preview document content inline
- Click to open detail/edit view
- Show recent edits by the agent

### Permission Manager
- List which apps Pinchr has Automation access to
- Guide user through granting permissions
- Show status per app (Word ✅, Excel ❌, etc.)

## Pricing
- **Tier 1 (Awareness):** Basic plan — see what's open
- **Tier 2+3 (Editing):** Pro plan — read and edit documents

## Dependencies (Node-native, no Python required)
```json
{
  "docx": "^9.x",           // .docx creation/editing
  "mammoth": "^1.x",        // .docx reading (extracts clean HTML/text)
  "exceljs": "^4.x",        // .xlsx read/write
  "pptxgenjs": "^3.x",      // .pptx creation
  "papaparse": "^5.x",      // CSV parsing
  "pdf-parse": "^1.x"       // PDF text extraction
}
```

## Security
- File access scoped to documents the user has open or explicitly selects
- No silent file system scanning
- Agent must explain what it's changing before writing
- Undo support: keep backup of original before any edit
- All edits logged in activity feed

## What NOT to Build (yet)
- Google Docs/Sheets/Slides integration (different approach — API-based, not local)
- Collaborative editing / real-time sync
- OCR for scanned PDFs
- Template marketplace
- Mail merge at scale
