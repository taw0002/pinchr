/**
 * Document Intelligence — System Awareness (Phase 1)
 *
 * Provides the ability to:
 * - See what apps are running and what documents they have open
 * - Read content from Office documents (.docx, .xlsx, .pptx)
 * - Get document metadata
 *
 * Uses AppleScript for app queries and Node-native libraries for file reading.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'

const execFileAsync = promisify(execFile)

// ── Types ──────────────────────────────────────────────────────────────

export interface RunningApp {
  name: string
  bundleId: string
  pid: number
  frontmost: boolean
}

export interface OpenDocument {
  app: string
  name: string
  path: string | null
}

export interface FrontmostApp {
  name: string
  bundleId: string
  pid: number
  documents: OpenDocument[]
}

export interface DocumentMetadata {
  path: string
  name: string
  sizeBytes: number
  extension: string
  exists: boolean
}

export interface DocumentContent {
  path: string
  text: string
  paragraphs?: string[]
  metadata?: Record<string, unknown>
}

// ── AppleScript Helpers ────────────────────────────────────────────────

async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    })
    return stdout.trim()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // Permission denied or app not running — return empty rather than throw
    if (msg.includes('not allowed') || msg.includes('(-1743)') || msg.includes('not running')) {
      return ''
    }
    throw error
  }
}

// ── App Awareness ──────────────────────────────────────────────────────

/**
 * Get all running foreground applications.
 */
export async function getRunningApps(): Promise<RunningApp[]> {
  const script = `
    tell application "System Events"
      set appList to ""
      repeat with proc in (every process whose background only is false)
        set appName to name of proc
        set appPid to unix id of proc
        set appBundle to bundle identifier of proc
        set isFront to frontmost of proc
        set appList to appList & appName & "|||" & appBundle & "|||" & appPid & "|||" & isFront & "\\n"
      end repeat
      return appList
    end tell
  `

  const result = await runAppleScript(script)
  if (!result) return []

  return result
    .split('\n')
    .filter((line) => line.includes('|||'))
    .map((line) => {
      const [name, bundleId, pidStr, frontmostStr] = line.split('|||')
      return {
        name: name?.trim() ?? '',
        bundleId: bundleId?.trim() ?? '',
        pid: parseInt(pidStr?.trim() ?? '0', 10),
        frontmost: frontmostStr?.trim() === 'true',
      }
    })
    .filter((app) => app.name)
}

/**
 * Get the frontmost application and its open documents.
 */
export async function getFrontmostApp(): Promise<FrontmostApp | null> {
  const script = `
    tell application "System Events"
      set frontProc to first process whose frontmost is true
      set appName to name of frontProc
      set appBundle to bundle identifier of frontProc
      set appPid to unix id of frontProc
      return appName & "|||" & appBundle & "|||" & appPid
    end tell
  `

  const result = await runAppleScript(script)
  if (!result) return null

  const [name, bundleId, pidStr] = result.split('|||')
  const app: FrontmostApp = {
    name: name?.trim() ?? '',
    bundleId: bundleId?.trim() ?? '',
    pid: parseInt(pidStr?.trim() ?? '0', 10),
    documents: [],
  }

  // Try to get open documents for the frontmost app
  app.documents = await getOpenDocuments(app.name)
  return app
}

/**
 * Get open documents for a specific application.
 * Supports: Microsoft Word, Excel, PowerPoint, Pages, Numbers, Keynote,
 * TextEdit, Preview, and generic apps via System Events.
 */
export async function getOpenDocuments(appName?: string): Promise<OpenDocument[]> {
  if (!appName) {
    // Get docs from all known document-based apps
    const apps = ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Pages', 'Numbers', 'Keynote', 'TextEdit', 'Preview']
    const allDocs: OpenDocument[] = []
    for (const app of apps) {
      const docs = await getDocsForApp(app)
      allDocs.push(...docs)
    }
    return allDocs
  }
  return getDocsForApp(appName)
}

async function getDocsForApp(appName: string): Promise<OpenDocument[]> {
  // First check if the app is running
  const checkScript = `
    tell application "System Events"
      return (name of every process) contains "${appName}"
    end tell
  `
  const isRunning = await runAppleScript(checkScript)
  if (isRunning !== 'true') return []

  // App-specific document queries
  const scriptMap: Record<string, string> = {
    'Microsoft Word': `
      tell application "Microsoft Word"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          set docPath to full name of doc
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Microsoft Excel': `
      tell application "Microsoft Excel"
        set docList to ""
        repeat with wb in workbooks
          set docName to name of wb
          set docPath to full name of wb
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Microsoft PowerPoint': `
      tell application "Microsoft PowerPoint"
        set docList to ""
        repeat with pres in presentations
          set docName to name of pres
          set docPath to full name of pres
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Pages': `
      tell application "Pages"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          try
            set docPath to file of doc as text
          on error
            set docPath to ""
          end try
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Numbers': `
      tell application "Numbers"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          try
            set docPath to file of doc as text
          on error
            set docPath to ""
          end try
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Keynote': `
      tell application "Keynote"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          try
            set docPath to file of doc as text
          on error
            set docPath to ""
          end try
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'TextEdit': `
      tell application "TextEdit"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          try
            set docPath to path of doc
          on error
            set docPath to ""
          end try
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
    'Preview': `
      tell application "Preview"
        set docList to ""
        repeat with doc in documents
          set docName to name of doc
          try
            set docPath to path of doc
          on error
            set docPath to ""
          end try
          set docList to docList & docName & "|||" & docPath & "\\n"
        end repeat
        return docList
      end tell
    `,
  }

  const script = scriptMap[appName]
  if (!script) {
    // Generic fallback — try getting window titles
    const genericScript = `
      tell application "System Events"
        tell process "${appName}"
          set winList to ""
          repeat with win in windows
            set winList to winList & title of win & "|||" & "" & "\\n"
          end repeat
          return winList
        end tell
      end tell
    `
    const result = await runAppleScript(genericScript)
    return parseDocList(appName, result)
  }

  const result = await runAppleScript(script)
  return parseDocList(appName, result)
}

function parseDocList(appName: string, raw: string): OpenDocument[] {
  if (!raw) return []

  return raw
    .split('\n')
    .filter((line) => line.includes('|||'))
    .map((line) => {
      const [name, pathRaw] = line.split('|||')
      let path = pathRaw?.trim() ?? ''

      // Convert macOS alias paths (Macintosh HD:Users:...) to POSIX
      if (path.includes(':') && !path.startsWith('/')) {
        path = '/' + path.split(':').slice(1).join('/')
      }

      return {
        app: appName,
        name: name?.trim() ?? '',
        path: path || null,
      }
    })
    .filter((doc) => doc.name)
}

// ── Document Reading ───────────────────────────────────────────────────

/**
 * Read text content from a document file.
 * Supports .docx, .txt, .md, .csv, .json.
 * For .docx, uses a lightweight text extraction approach.
 */
export async function readDocumentContent(filePath: string): Promise<DocumentContent> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'xml':
    case 'html':
    case 'htm': {
      const text = readFileSync(filePath, 'utf-8')
      return { path: filePath, text }
    }

    case 'docx':
      return readDocx(filePath)

    case 'xlsx':
      return readXlsx(filePath)

    default:
      throw new Error(`Unsupported file type: .${ext}. Supported: .docx, .xlsx, .txt, .md, .csv, .json`)
  }
}

/**
 * Extract text from a .docx file using the ZIP structure.
 * No external dependencies needed — docx is just a ZIP with XML inside.
 */
async function readDocx(filePath: string): Promise<DocumentContent> {
  // Use Python as a reliable cross-platform docx reader
  // (python-docx handles styles, tables, etc. better than raw XML parsing)
  try {
    const { stdout } = await execFileAsync('python3', [
      '-c',
      `
import json, sys
try:
    from docx import Document
    doc = Document(sys.argv[1])
    paragraphs = [p.text for p in doc.paragraphs]
    tables = []
    for table in doc.tables:
        rows = []
        for row in table.rows:
            rows.append([cell.text for cell in row.cells])
        tables.append(rows)
    result = {"paragraphs": paragraphs, "tables": tables, "text": "\\n".join(paragraphs)}
    print(json.dumps(result))
except ImportError:
    # Fallback: raw XML extraction
    import zipfile, re
    with zipfile.ZipFile(sys.argv[1]) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    texts = re.findall(r'<w:t[^>]*>([^<]+)</w:t>', xml)
    result = {"text": " ".join(texts), "paragraphs": [" ".join(texts)]}
    print(json.dumps(result))
`,
      filePath,
    ], { timeout: 15_000 })

    const parsed = JSON.parse(stdout.trim())
    return {
      path: filePath,
      text: parsed.text ?? '',
      paragraphs: parsed.paragraphs ?? [],
      metadata: parsed.tables ? { tableCount: parsed.tables.length } : undefined,
    }
  } catch (error) {
    // Last resort: try raw ZIP extraction without Python
    throw new Error(`Failed to read .docx: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract text from an .xlsx file.
 */
async function readXlsx(filePath: string): Promise<DocumentContent> {
  try {
    const { stdout } = await execFileAsync('python3', [
      '-c',
      `
import json, sys
try:
    from openpyxl import load_workbook
    wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
    sheets = {}
    for name in wb.sheetnames:
        ws = wb[name]
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append([str(cell) if cell is not None else "" for cell in row])
        sheets[name] = rows
    result = {"sheets": sheets, "sheetNames": wb.sheetnames}
    text_parts = []
    for name, rows in sheets.items():
        text_parts.append(f"=== Sheet: {name} ===")
        for row in rows:
            text_parts.append("\\t".join(row))
    result["text"] = "\\n".join(text_parts)
    print(json.dumps(result))
except ImportError:
    print(json.dumps({"text": "openpyxl not installed. Run: pip3 install openpyxl", "sheets": {}}))
`,
      filePath,
    ], { timeout: 15_000 })

    const parsed = JSON.parse(stdout.trim())
    return {
      path: filePath,
      text: parsed.text ?? '',
      metadata: { sheets: parsed.sheetNames ?? [], sheetCount: Object.keys(parsed.sheets ?? {}).length },
    }
  } catch (error) {
    throw new Error(`Failed to read .xlsx: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get metadata about a document file.
 */
export function getDocumentMetadata(filePath: string): DocumentMetadata {
  const exists = existsSync(filePath)
  const name = filePath.split('/').pop() ?? filePath
  const extension = name.split('.').pop()?.toLowerCase() ?? ''

  let sizeBytes = 0
  if (exists) {
    try {
      const { size } = require('fs').statSync(filePath)
      sizeBytes = size
    } catch {
      // ignore
    }
  }

  return { path: filePath, name, sizeBytes, extension, exists }
}
