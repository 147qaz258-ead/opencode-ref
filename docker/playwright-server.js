#!/usr/bin/env node
/**
 * Playwright HTTP Server
 *
 * Runs inside the Docker container, provides HTTP API for browser automation.
 * Playwright and browser run entirely inside the container.
 */

const { chromium } = require('playwright');
const http = require('http');

const PORT = 9223;
let browser = null;
let context = null;
let page = null;

/**
 * Send JSON response
 */
function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(res, message, code = 'ERROR', statusCode = 400) {
  sendJson(res, {
    success: false,
    error: {
      code,
      message
    }
  }, statusCode);
}

/**
 * Initialize browser
 */
async function initBrowser() {
  if (!browser) {
    // Try to use system chromium-browser
    const chromiumPath = '/usr/bin/chromium-browser';

    browser = await chromium.launch({
      headless: false,
      executablePath: chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--display=:99'
      ]
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 1024 }
    });
    page = await context.newPage();
    console.log('✅ Playwright browser initialized');
  }
  return { browser, context, page };
}

/**
 * HTTP Request handler
 */
async function handleRequest(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // Health check
    if (pathname === '/health') {
      const isReady = browser !== null;
      sendJson(res, {
        status: 'ok',
        browser: isReady ? 'running' : 'initializing',
        timestamp: Date.now()
      });
      return;
    }

    // Initialize browser if needed
    await initBrowser();

    // Navigate
    if (pathname === '/navigate' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const response = await page.goto(body.url, {
        waitUntil: 'domcontentloaded',
        timeout: body.timeout || 30000
      });
      sendJson(res, {
        success: true,
        url: page.url(),
        title: await page.title(),
        status: response?.status()
      });
      return;
    }

    // Snapshot - extract interactive elements
    if (pathname === '/snapshot' && req.method === 'GET') {
      const elements = await page.evaluate(() => {
        const interactive = 'button, [role="button"], a, input, textarea, select, [onclick]';
        const elements = document.querySelectorAll(interactive);
        return Array.from(elements).map((el, idx) => ({
          ref: 'e' + idx,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || el.type || '',
          name: el.textContent?.slice(0, 50).trim() || el.placeholder || el.name || '',
          id: el.id || undefined,
          class: el.className || undefined
        }));
      });
      sendJson(res, {
        success: true,
        url: page.url(),
        title: await page.title(),
        elements
      });
      return;
    }

    // Act - perform action on element
    if (pathname === '/act' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const { ref, action, value, selector } = body;

      if (action === 'click') {
        if (selector) {
          await page.click(selector, { timeout: 5000 });
        } else {
          // Find element by ref index
          const element = await page.evaluate((idx) => {
            const interactive = 'button, [role="button"], a, input, textarea, select, [onclick]';
            const elements = document.querySelectorAll(interactive);
            const el = elements[idx];
            if (el) {
              el.click();
              return { found: true, tag: el.tagName };
            }
            return { found: false };
          }, parseInt(ref.slice(1)));
          if (!element.found) {
            sendError(res, `Element ${ref} not found`, 'ELEMENT_NOT_FOUND', 404);
            return;
          }
        }
        sendJson(res, { success: true, action: 'clicked', ref });
      } else if (action === 'fill') {
        if (selector) {
          await page.fill(selector, value);
        } else {
          await page.evaluate((params) => {
            const elements = document.querySelectorAll('input, textarea');
            const el = elements[parseInt(params.ref.slice(1))];
            if (el) {
              el.value = params.value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return { found: true };
            }
            return { found: false };
          }, { ref, value });
        }
        sendJson(res, { success: true, action: 'filled', ref, value });
      } else if (action === 'script') {
        const result = await page.evaluate(value);
        sendJson(res, { success: true, action: 'executed', result });
      } else {
        sendError(res, `Unknown action: ${action}`, 'UNKNOWN_ACTION', 400);
      }
      return;
    }

    // Screenshot
    if (pathname === '/screenshot' && req.method === 'GET') {
      const screenshot = await page.screenshot({
        fullPage: url.searchParams.get('fullPage') === 'true'
      });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(screenshot);
      return;
    }

    // Status
    if (pathname === '/status' && req.method === 'GET') {
      sendJson(res, {
        success: true,
        browser: 'connected',
        url: page.url(),
        title: await page.title(),
        elementCount: await page.evaluate(() => document.querySelectorAll('button, a, input, textarea, select').length)
      });
      return;
    }

    // 404
    sendError(res, 'Not found', 'NOT_FOUND', 404);

  } catch (error) {
    console.error('Request error:', error);
    sendError(res, error.message, 'REQUEST_ERROR', 500);
  }
}

/**
 * Get JSON body from request
 */
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Start server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Playwright HTTP Server listening on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 API endpoints:`);
  console.log(`   POST /navigate`);
  console.log(`   GET  /snapshot`);
  console.log(`   POST /act`);
  console.log(`   GET  /screenshot`);
  console.log(`   GET  /status`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  if (browser) await browser.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  if (browser) await browser.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
