#!/usr/bin/env node
/**
 * Combined Server (Playwright + Agent Shell/File API)
 * 
 * Replaces the limited playwright-server.js to restore full agent functionality.
 * Handles:
 * 1. Playwright Browser Automation (port 9223)
 * 2. Shell/File API for Agent (port 8080)
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// Configuration
const PLAYWRIGHT_PORT = 9223;
const AGENT_PORT = 8080;

// ==========================================
// Playwright Logic
// ==========================================
let browser = null;
let context = null;
let page = null;

async function initBrowser() {
  if (!browser) {
    try {
      // Use the verified chromium path
      const chromiumPath = '/usr/bin/chromium';
      
      console.log(`[Browser] Launching Chromium at ${chromiumPath}...`);
      browser = await chromium.launch({
        headless: false, // Run in headful mode for Xvfb
        executablePath: chromiumPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--display=:99'
        ]
      });
      console.log('[Browser] Browser launched ok');
      
      context = await browser.newContext({
        viewport: { width: 1280, height: 1024 }
      });
      page = await context.newPage();
      console.log('[Browser] Page created');
    } catch (err) {
      console.error('[Browser] Failed to launch browser:', err);
      throw err;
    }
  }
  return { browser, context, page };
}

async function handlePlaywrightRequest(req, res, body, pathname) {
  try {
    // initialize if valid browser endpoint
    if (['/navigate', '/snapshot', '/act', '/screenshot', '/status'].includes(pathname)) {
       await initBrowser();
    }

    if (pathname === '/health') {
      sendJson(res, { status: 'ok', browser: browser ? 'running' : 'initializing' });
      return;
    }

    if (pathname === '/navigate') {
      const { url, timeout } = body;
      console.log(`[Browser] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout || 30000 });
      sendJson(res, {
        success: true,
        url: page.url(),
        title: await page.title()
      });
    } else if (pathname === '/snapshot') {
      const elements = await page.evaluate(() => {
        const interactive = 'button, [role="button"], a, input, textarea, select, [onclick]';
        const els = document.querySelectorAll(interactive);
        return Array.from(els).map((el, idx) => ({
          ref: 'e' + idx,
          tag: el.tagName.toLowerCase(),
          name: el.textContent?.slice(0, 50).trim() || el.placeholder || el.name || '',
        }));
      });
      sendJson(res, {
        success: true,
        url: page.url(),
        title: await page.title(),
        elements
      });
    } else if (pathname === '/act') {
      const { action, ref, value, selector } = body;
      if (action === 'click') {
          if (selector) {
              await page.click(selector);
          } else {
              // ref based click
              await page.evaluate((idx) => {
                  const interactive = 'button, [role="button"], a, input, textarea, select, [onclick]';
                  const els = document.querySelectorAll(interactive);
                  if (els[idx]) els[idx].click();
              }, parseInt(ref.slice(1)));
          }
          sendJson(res, { success: true, action: 'clicked' });
      } else if (action === 'fill') {
          if (selector) {
              await page.fill(selector, value);
          } else {
              await page.evaluate(({idx, val}) => {
                  const els = document.querySelectorAll('input, textarea');
                  if (els[idx]) {
                      els[idx].value = val;
                      els[idx].dispatchEvent(new Event('input', { bubbles: true }));
                  }
              }, { idx: parseInt(ref.slice(1)), val: value });
          }
          sendJson(res, { success: true, action: 'filled' });
      } else if (action === 'script') {
          const result = await page.evaluate(value);
          sendJson(res, { success: true, result });
      }
    } else if (pathname === '/screenshot') {
      const buf = await page.screenshot({ fullPage: true });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(buf);
    } else if (pathname === '/status') {
      sendJson(res, {
        success: true,
        url: page?.url(),
        title: await page?.title()
      });
    } else {
      sendError(res, 'Not found', 404);
    }
  } catch (err) {
    console.error('[Browser] Error:', err);
    sendError(res, err.message, 500);
  }
}

// ==========================================
// Agent Shell/File API Logic
// ==========================================

async function handleAgentRequest(req, res, body, pathname) {
  try {
    console.log(`[Agent] Request: ${req.method} ${pathname}`);
    
    // Shell Exec
    if (pathname === '/api/v1/shell/exec') {
      const { command, exec_dir, id } = body;

      // Only use exec_dir if provided, otherwise let shell use its default directory
      const execOptions = { shell: '/bin/bash' };
      if (exec_dir) {
        execOptions.cwd = exec_dir;
      }

      console.log(`[Shell] Executing: ${command}${exec_dir ? ` in ${exec_dir}` : ''}`);

      exec(command, execOptions, (error, stdout, stderr) => {
        sendJson(res, {
          success: true,
          data: {
            exit_code: error ? error.code || 1 : 0,
            stdout: stdout || '',
            stderr: stderr || '',
            // Legacy fields for compatibility
            returncode: error ? error.code || 1 : 0,
            output: stdout || ''
          }
        });
      });
      return;
    }

    // File Read
    if (pathname === '/api/v1/file/read') {
      const { file, start_line, end_line } = body;
      try {
        const content = fs.readFileSync(file, 'utf8');
        // Simple full read for now, handle lines if needed but typically agents handle full file
        // To be precise let's match line logic if requested
        let result = content;
        if (start_line !== undefined && end_line !== undefined) {
             const lines = content.split('\n');
             // 1-based index expected usually? SDK bash.ts uses 1-based.
             // But existing http-api.ts doesn't seem to do slicing in backend, it sends params.
             // We'll return full content for simplicity unless file is huge.
             // Let's implement basic slicing 1-based
             const start = Math.max(0, start_line - 1);
             const end = end_line; 
             result = lines.slice(start, end).join('\n');
        }
        
        sendJson(res, {
          success: true,
          data: { content: result }
        });
      } catch (err) {
        sendError(res, `Failed to read file: ${err.message}`, 500);
      }
      return;
    }

    // File Write
    if (pathname === '/api/v1/file/write') {
      const { file, content, mode } = body;
      try {
        const dirname = path.dirname(file);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
        
        const flag = mode === 'append' ? 'a' : 'w';
        fs.writeFileSync(file, content, { encoding: 'utf8', flag });
        const stats = fs.statSync(file);
        
        sendJson(res, {
          success: true,
          data: { size: stats.size }
        });
      } catch (err) {
        sendError(res, `Failed to write file: ${err.message}`, 500);
      }
      return;
    }

    // File List
    if (pathname === '/api/v1/file/list') {
      const { path: dirPath } = body;
      try {
        const items = fs.readdirSync(dirPath);
        const entries = items.map(name => {
           try {
             const fullPath = path.join(dirPath, name);
             const stats = fs.statSync(fullPath);
             return {
               name,
               type: stats.isDirectory() ? 'directory' : 'file',
               size: stats.size
             };
           } catch {
             return null;
           }
        }).filter(Boolean);
        
        sendJson(res, {
          success: true,
          data: entries
        });
      } catch (err) {
         // Return empty or error? http-api expects success=true usually
         sendError(res, `Failed to list dir: ${err.message}`, 500);
      }
      return;
    }
    
    // File Find (Glob)
    if (pathname === '/api/v1/file/find') {
        const { path: searchPath, glob: pattern } = body;
        // Use find command as we don't have glob package guarantees
        // Basic implementation: find <path> -name <pattern>
        // Note: glob patterns are complex, -name handles * and ? but not ** usually without logic
        // Let's try to pass it to `find` cmd
        // Security note within sandbox: mostly fine.
        
        // Clean pattern to basic
        const safePath = searchPath || '.';
        
        // Use shell execution for find
        const findCmd = `find "${safePath}" -name "${pattern}" -not -path '*/.*'`; // exclude hidden
        exec(findCmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
            const files = stdout.split('\n').filter(Boolean);
            sendJson(res, {
                success: true,
                data: { files }
            });
        });
        return;
    }
    
    // File Stat (Explicit API, though http-api.ts uses shell exec stat)
    if (pathname === '/api/v1/file/stat') {
        const { file } = body;
        try {
            const stats = fs.statSync(file);
            sendJson(res, {
                success: true,
                data: {
                    exists: true,
                    type: stats.isDirectory() ? 'directory' : 'file',
                    size: stats.size,
                    modified: Math.floor(stats.mtimeMs / 1000)
                }
            });
        } catch (err) {
            if (err.code === 'ENOENT') {
                 sendJson(res, { success: true, data: { exists: false } }); // 200 OK but exists false
            } else {
                 sendError(res, err.message, 500);
            }
        }
        return;
    }

    sendError(res, `Unknown endpoint ${pathname}`, 404);

  } catch (err) {
    console.error('[Agent] Error:', err);
    sendError(res, err.message, 500);
  }
}


// ==========================================
// Server Infrastructure
// ==========================================

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJson(res, { success: false, error: message, message }, status);
}

function getBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function createHandler(type) {
  return async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const body = await getBody(req);
    
    if (type === 'playwright') {
      await handlePlaywrightRequest(req, res, body, url.pathname);
    } else {
      await handleAgentRequest(req, res, body, url.pathname);
    }
  };
}

// Start Servers
const playwrightServer = http.createServer(createHandler('playwright'));
playwrightServer.listen(PLAYWRIGHT_PORT, '0.0.0.0', () => {
  console.log(`🚀 Playwright Server listening on port ${PLAYWRIGHT_PORT}`);
});

const agentServer = http.createServer(createHandler('agent'));
agentServer.listen(AGENT_PORT, '0.0.0.0', () => {
  console.log(`🚀 Agent Server listening on port ${AGENT_PORT}`);
});

// Keep alive
setInterval(() => {}, 1000 * 60 * 60);
