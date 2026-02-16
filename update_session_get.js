const fs = require('fs');
const path = require('path');

const filePath = path.join('packages', 'opencode', 'src', 'session', 'index.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// The new get function - simplified to match the task requirements
const newGet = `  export const get = fn(Identifier.schema("session"), async (id) => {
    // Use getSessionStoragePath for user-isolated storage
    const { getCurrentUserId, getSessionStoragePath } = await import("../server/middleware/user-context")
    const userId = getCurrentUserId()
    const sessionPath = getSessionStoragePath(userId, id)

    try {
      const data = await Storage.read<Info>(sessionPath)
      return data
    } catch {
      // Return null for non-existent sessions
      return null
    }
  })`;

// Find and replace the get function
const getRegex = /export const get = fn\(Identifier\.schema\("session"\), async \(id\) => \{[\s\S]*?export const getShare/;
content = content.replace(getRegex, newGet + '\n\n  export const getShare');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('get function updated successfully');
