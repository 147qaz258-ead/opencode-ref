const fs = require('fs');

async function main() {
  const logPath = 'd:\\C_Projects\\Agent\\opencode-ref\\.opencode\\storage\\log\\session-ses_3d30ce9ccffeF7MnhXIph4R910.log';
  if (!fs.existsSync(logPath)) {
    console.log("Log file not found:", logPath);
    return;
  }
  
  const content = fs.readFileSync(logPath, 'utf8');
  const matches = content.match(/http:\/\/localhost:(\d+)/g);
  
  if (!matches) {
    console.log('No URL found');
    return;
  }
  
  const baseUrl = matches.pop();
  console.log('Target API:', baseUrl);

  // Probe OpenAPI specs
  const endpoints = ['/openapi.json', '/docs', '/api/docs', '/swagger.json'];
  
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`);
      if (res.ok) {
        console.log(`FOUND Schema at ${endpoint}`);
        const text = await res.text();
        // If JSON, try to parse and find file/stat
        try {
           const json = JSON.parse(text);
           const paths = json.paths || {};
           console.log('Paths located:', Object.keys(paths).filter(p => p.includes('file')));
           
           const statPath = paths['/api/v1/file/stat'];
           if (statPath) {
             console.log('STAT Definition:', JSON.stringify(statPath, null, 2));
           }
        } catch (e) {
           console.log('Preview:', text.substring(0, 500));
        }
        break; 
      } else {
        console.log(`Checking ${endpoint}: ${res.status}`);
      }
    } catch (e) {
       console.log(`Error checking ${endpoint}: ${e.message}`);
    }
  }
}

main().catch(console.error);
