# Document Preferences — Pinchr Feature Spec

## Overview
A settings page where users define their preferred formatting standards for documents. The agent reads these preferences before creating or editing any document. Think of it as "my style guide" that the AI follows automatically.

## Storage
- File: `document-preferences.json` in OpenClaw workspace (via `window.api.files.read/write`)
- Same pattern as tasks.json — Electron IPC to workspace dir

## Data Model

```typescript
interface DocumentPreferences {
  version: 1
  word: WordPreferences
  pdf: PdfPreferences
  spreadsheet: SpreadsheetPreferences
  presentation: PresentationPreferences
}

interface WordPreferences {
  // Page layout
  margins: 'normal' | 'narrow' | 'wide' | 'custom'  // normal = 1 inch all sides
  customMargins?: { top: number; bottom: number; left: number; right: number } // inches

  // Typography
  fontFamily: string      // default: 'Calibri' (Word theme default)
  fontSize: number         // default: 11
  headingFont: string      // default: same as fontFamily
  
  // Structure
  titleAlignment: 'left' | 'center' | 'right'  // default: center
  titleBold: boolean       // default: true
  
  // Labels (e.g. "Employee:", "Title:")
  labelBold: boolean       // default: true
  labelValueSameLine: boolean  // default: true (bold label + normal value on same paragraph)
  
  // Section headings
  sectionHeadingBold: boolean  // default: true
  sectionNumbering: 'none' | 'numbers' | 'roman' | 'letters'  // default: none
  
  // Bullets
  bulletStyle: 'list-paragraph' | 'manual'  // default: list-paragraph (Word's native)
  bulletBold: boolean      // default: false
  
  // Spacing
  sectionSpacing: boolean  // default: true (blank line between sections)
  lineSpacing: 'single' | '1.15' | '1.5' | 'double'  // default: single (Word default)
  
  // Date
  datePosition: 'top-left' | 'top-right' | 'top-center' | 'none'
  dateBold: boolean        // default: true
  dateFormat: string       // default: 'MMM DD, YYYY'
}

interface PdfPreferences {
  margins: 'normal' | 'narrow' | 'wide' | 'custom'
  customMargins?: { top: number; bottom: number; left: number; right: number }
  fontFamily: string       // default: 'Helvetica'
  fontSize: number          // default: 11
  headingFont: string
  headerEnabled: boolean    // default: false
  headerText?: string
  footerEnabled: boolean    // default: false
  footerText?: string
  pageNumbers: boolean      // default: false
  pageNumberPosition: 'bottom-center' | 'bottom-right' | 'top-right'
}

interface SpreadsheetPreferences {
  // Header row
  headerBold: boolean       // default: true
  headerBackground: string  // default: '#4472C4' (blue)
  headerTextColor: string   // default: '#FFFFFF'
  headerFontSize: number    // default: 11
  
  // Data
  fontSize: number          // default: 11
  fontFamily: string        // default: 'Calibri'
  alternateRowColors: boolean  // default: true
  alternateRowColor: string    // default: '#F2F2F2'
  
  // Formatting
  numberFormat: string      // default: '#,##0.00'
  currencyFormat: string    // default: '$#,##0.00'
  dateFormat: string        // default: 'MM/DD/YYYY'
  
  // Layout
  autoFitColumns: boolean   // default: true
  freezeHeaderRow: boolean  // default: true
  gridLines: boolean        // default: true
}

interface PresentationPreferences {
  // Theme
  primaryColor: string      // default: '#2B579A'
  accentColor: string       // default: '#ED7D31'
  backgroundColor: string   // default: '#FFFFFF'
  
  // Typography
  titleFont: string         // default: 'Calibri'
  titleSize: number         // default: 36
  bodyFont: string          // default: 'Calibri'
  bodySize: number          // default: 18
  
  // Layout
  slideLayout: 'standard' | 'widescreen'  // default: widescreen (16:9)
  
  // Branding
  logoEnabled: boolean      // default: false
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  // logo file would be stored separately
  
  // Bullets
  bulletStyle: 'disc' | 'dash' | 'arrow' | 'none'  // default: disc
}
```

## UI Design

### New Page: "Document Style" (or add as tab in Settings)
- Sidebar entry with `FileText` icon, positioned after Settings
- Four collapsible sections (accordion), one per document type
- Each section shows a preview card + edit controls

### Layout Per Section:
```
┌─────────────────────────────────────────────┐
│  📄 Word Documents                    [Edit] │
│                                              │
│  Font: Calibri 11pt                          │
│  Title: Center, Bold                         │
│  Headings: Bold, No Numbering                │
│  Bullets: List Paragraph, Non-bold           │
│  Margins: 1 inch                             │
│  Spacing: Single                             │
│                                              │
│  ──────────────────────────────────────────  │
│  📊 Spreadsheets                      [Edit] │
│  ...                                         │
└─────────────────────────────────────────────┘
```

### Edit Mode (Sheet/Drawer):
When user clicks Edit, open a Sheet/drawer with form controls:
- Dropdowns for enums (alignment, numbering style, margins)
- Color pickers for colors (spreadsheet headers, presentation theme)
- Number inputs for sizes
- Toggles for booleans
- Font selector (common fonts dropdown + custom input)
- Live mini-preview showing how a sample document would look with current settings

### Default Values
Pre-populate with Drew's formatting standard (from TOOLS.md):
- Word: Calibri 11, center title, bold labels + non-bold values, no section numbering, List Paragraph bullets (non-bold), 1-inch margins, blank line between sections
- PDF: Helvetica 11, normal margins, no header/footer
- Spreadsheet: Bold white-on-blue headers, alternating rows, auto-fit columns
- Presentation: Calibri, widescreen, standard Office blue/orange

## Components to Create:
1. `src/renderer/src/pages/DocumentPreferences.tsx` — main page
2. `src/renderer/src/hooks/useDocumentPreferences.ts` — read/write prefs from workspace
3. `src/renderer/src/components/documents/WordPrefsEditor.tsx`
4. `src/renderer/src/components/documents/PdfPrefsEditor.tsx`  
5. `src/renderer/src/components/documents/SpreadsheetPrefsEditor.tsx`
6. `src/renderer/src/components/documents/PresentationPrefsEditor.tsx`
7. `src/renderer/src/components/documents/PrefsPreviewCard.tsx` — summary card

## Integration Points:
- Add to sidebar (below Settings or Memory)
- Add to App.tsx routes
- Add to CommandPalette
- Keyboard shortcut: ⌘8 or similar

## Existing Patterns to Follow:
- File I/O: Same as `useTasks.ts` — uses `window.api.files.read('document-preferences.json')` / `window.api.files.write('document-preferences.json', content)`
- UI: Uses shadcn Card, Sheet, Accordion, Select, Switch, Input, Label, Separator
- Animation: framer-motion stagger pattern (same as all other pages)
- State: React Query for caching + manual invalidation on save
- Dark theme: All existing Tailwind dark classes

## Tech Notes:
- NO gateway calls — this is purely local preferences stored in workspace
- These prefs are READ by the agent when creating/editing documents (the agent reads the JSON)
- The agent is responsible for applying these styles (via python-docx, etc.) — Pinchr just stores and displays the preferences
- Include a "Reset to Defaults" button per section
- Include an "Export" / "Import" option for sharing preferences across machines
