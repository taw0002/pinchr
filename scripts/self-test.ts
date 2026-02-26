#!/usr/bin/env npx tsx
/**
 * Pinchr Self-Test Harness
 * 
 * Connects to running Pinchr app via CDP (Chrome DevTools Protocol),
 * navigates to each page, takes screenshots, and checks for errors.
 * 
 * Usage:
 *   npx tsx scripts/self-test.ts
 *   
 * Requires Pinchr to be running with --remote-debugging-port=9222
 * (deploy.sh adds this automatically)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const CDP_PORT = 9222
const SCREENSHOT_DIR = join(__dirname, '..', 'test-screenshots')
const BASE_URL = `http://127.0.0.1:${CDP_PORT}`

interface TestResult {
  page: string
  status: 'pass' | 'fail' | 'error'
  screenshot?: string
  consoleErrors: string[]
  duration: number
  notes: string
}

const PAGES_TO_TEST = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'chat', label: 'Chat' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'workflows', label: 'Automations' },
  { id: 'agents', label: 'Agent Builder' },
  { id: 'connections', label: 'Connections' },
  { id: 'mcp-servers', label: 'MCP Servers' },
  { id: 'brain', label: 'Brain' },
  { id: 'memory-explorer', label: 'Memory Explorer' },
  { id: 'document-style', label: 'Document Style' },
  { id: 'usage', label: 'Usage' },
  { id: 'security', label: 'Security' },
  { id: 'settings', label: 'Settings' },
]

async function getTargets(): Promise<Array<{ id: string; title: string; url: string; webSocketDebuggerUrl: string }>> {
  const res = await fetch(`${BASE_URL}/json`)
  return res.json()
}

async function connectToPage(wsUrl: string): Promise<{ send: (method: string, params?: Record<string, unknown>) => Promise<unknown>; close: () => void }> {
  return new Promise((resolve, reject) => {
    // Use dynamic import for ws if available, otherwise fall back
    import('ws').then(({ default: WebSocket }) => {
      const ws = new WebSocket(wsUrl)
      let msgId = 1
      const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

      ws.on('open', () => {
        resolve({
          send: (method: string, params: Record<string, unknown> = {}) => {
            return new Promise((res, rej) => {
              const id = msgId++
              pending.set(id, { resolve: res, reject: rej })
              ws.send(JSON.stringify({ id, method, params }))
            })
          },
          close: () => ws.close()
        })
      })

      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString())
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!
          pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error.message))
          else p.resolve(msg.result)
        }
      })

      ws.on('error', reject)
    }).catch(reject)
  })
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function takeScreenshot(cdp: ReturnType<typeof connectToPage> extends Promise<infer T> ? T : never, name: string): Promise<string> {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' }) as { data: string }
  const filePath = join(SCREENSHOT_DIR, `${name}.png`)
  writeFileSync(filePath, Buffer.from(result.data, 'base64'))
  return filePath
}

async function navigateToPage(cdp: ReturnType<typeof connectToPage> extends Promise<infer T> ? T : never, pageId: string): Promise<void> {
  // Pinchr uses hash-based routing — change the hash to navigate
  await cdp.send('Runtime.evaluate', {
    expression: `window.location.hash = '#/${pageId}'`
  })
}

async function getConsoleErrors(cdp: ReturnType<typeof connectToPage> extends Promise<infer T> ? T : never): Promise<string[]> {
  // Enable console and collect errors
  await cdp.send('Console.enable')
  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        // Check for React error boundaries or visible error text
        const errorBoundaries = document.querySelectorAll('[class*="error"], [class*="Error"]');
        const errors = [];
        errorBoundaries.forEach(el => {
          if (el.textContent?.includes('went wrong') || el.textContent?.includes('Error')) {
            errors.push(el.textContent.slice(0, 200));
          }
        });
        return JSON.stringify(errors);
      })()
    `,
    returnByValue: true
  }) as { result: { value: string } }

  try {
    return JSON.parse(result.result.value)
  } catch {
    return []
  }
}

async function getPageContent(cdp: ReturnType<typeof connectToPage> extends Promise<infer T> ? T : never): Promise<string> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `document.body?.innerText?.slice(0, 2000) || ''`,
    returnByValue: true
  }) as { result: { value: string } }
  return result.result.value || ''
}

async function runTests(): Promise<void> {
  console.log('🦞 Pinchr Self-Test Harness\n')

  // Ensure screenshot directory
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }

  // Get available targets
  let targets: Awaited<ReturnType<typeof getTargets>>
  try {
    targets = await getTargets()
  } catch (error) {
    console.error('❌ Cannot connect to Pinchr CDP. Make sure Pinchr is running with --remote-debugging-port=9222')
    console.error('   Run: open -a Pinchr --args --remote-debugging-port=9222')
    process.exit(1)
  }

  // Find the main Pinchr renderer
  const mainTarget = targets.find(t => t.url.includes('index.html') || t.title.includes('Pinchr'))
  if (!mainTarget) {
    console.error('❌ No Pinchr renderer target found. Available targets:', targets.map(t => t.title))
    process.exit(1)
  }

  console.log(`✅ Connected to: ${mainTarget.title} (${mainTarget.url})\n`)

  const cdp = await connectToPage(mainTarget.webSocketDebuggerUrl)
  const results: TestResult[] = []

  for (const page of PAGES_TO_TEST) {
    const start = Date.now()
    console.log(`Testing: ${page.label}...`)

    try {
      // Navigate
      await navigateToPage(cdp, page.id)
      await sleep(1500) // Wait for render

      // Screenshot
      const screenshotPath = await takeScreenshot(cdp, page.id)

      // Check for errors
      const errors = await getConsoleErrors(cdp)

      // Get page content for basic assertions
      const content = await getPageContent(cdp)
      const hasContent = content.length > 50
      const hasError = errors.length > 0 || content.includes('Something went wrong')

      const status = hasError ? 'fail' : hasContent ? 'pass' : 'error'
      const duration = Date.now() - start

      results.push({
        page: page.label,
        status,
        screenshot: screenshotPath,
        consoleErrors: errors,
        duration,
        notes: hasError ? `Errors: ${errors.join(', ')}` : hasContent ? 'Page rendered OK' : 'Page appears empty'
      })

      const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️'
      console.log(`  ${icon} ${page.label} (${duration}ms)${errors.length ? ` — ${errors.length} errors` : ''}`)
    } catch (error) {
      const duration = Date.now() - start
      results.push({
        page: page.label,
        status: 'error',
        consoleErrors: [(error as Error).message],
        duration,
        notes: `Exception: ${(error as Error).message}`
      })
      console.log(`  ❌ ${page.label} — ${(error as Error).message}`)
    }
  }

  cdp.close()

  // Summary
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const errored = results.filter(r => r.status === 'error').length

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed, ${errored} errors`)
  console.log(`Screenshots: ${SCREENSHOT_DIR}`)

  // Write results JSON
  const reportPath = join(SCREENSHOT_DIR, 'report.json')
  writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2))
  console.log(`Report: ${reportPath}`)

  if (failed + errored > 0) {
    console.log('\n⚠️ Issues found:')
    results.filter(r => r.status !== 'pass').forEach(r => {
      console.log(`  - ${r.page}: ${r.notes}`)
    })
  }
}

runTests().catch(console.error)
