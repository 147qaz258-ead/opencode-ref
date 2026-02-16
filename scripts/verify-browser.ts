
// Corrected to use ES modules / global fetch
// Update port to standard 9223 as mapped in docker run
const PORT = 9223; 

async function testBrowserDirectly() {
  console.log(`Checking browser health on port ${PORT}...`);
  
  try {
    // Health Check
    const health = await fetch(`http://localhost:${PORT}/health`);
    if (!health.ok) throw new Error(`Health check failed: ${health.statusText}`);
    const healthData = await health.json();
    console.log("Health Check:", healthData);
    
    // Check if status is OK (adjust based on actual response structure)
    if (healthData.status === 'ok' || healthData.status === 'ready' || health.status === 200) {
        console.log("Browser is running!");
        
        console.log("Attempting navigation to example.com...");
        const nav = await fetch(`http://localhost:${PORT}/navigate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com' })
        });
        
        const navData = await nav.json();
        console.log("Navigation Result:", navData);
        
        if (navData.success) {
            console.log("✅ Browser Navigation Successful!");
            console.log("Title:", navData.title);
        } else {
            console.log("❌ Navigation Failed:", navData);
        }
    }
  } catch (error) {
    console.error("Failed to connect to browser API:", error);
  }
}

testBrowserDirectly();
