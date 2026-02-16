import { readdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";

const EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".turbo",
  ".output",
  ".next",
  "artifacts",
  "coverage",
  "tmp"
];

const ROOT_PACKAGES = "d:\\C_Projects\\Agent\\opencode-ref\\packages";

async function getPackageDescription(packagePath: string): Promise<string | null> {
  try {
    const pkgJsonPath = join(packagePath, "package.json");
    const content = await readFile(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.description || null;
  } catch {
    return null;
  }
}

async function walk(dir: string, depth: number = 0, maxDepth: number = 6): Promise<string> {
  if (depth > maxDepth) return "";
  
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return "";
  }
  
  let output = "";
  
  // Sort files: directories first, then alphabetical
  const entries = await Promise.all(
    files
      .filter(f => !EXCLUDE.includes(f))
      .map(async f => {
        const fullPath = join(dir, f);
        try {
          const s = await stat(fullPath);
          return { name: f, isDir: s.isDirectory(), fullPath };
        } catch {
          return null;
        }
      })
  );
  
  const validEntries = entries.filter((e): e is { name: string; isDir: boolean; fullPath: string } => e !== null);
  validEntries.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
  
  for (const entry of validEntries) {
    const indent = "  ".repeat(depth);
    const icon = entry.isDir ? "📁" : "📄";
    
    let suffix = "";
    if (depth === 0 && entry.isDir) {
      const desc = await getPackageDescription(entry.fullPath);
      if (desc) suffix = ` - *${desc}*`;
    }
    
    output += `${indent}${icon} ${entry.name}${suffix}\n`;
    
    if (entry.isDir) {
      output += await walk(entry.fullPath, depth + 1, maxDepth);
    }
  }
  return output;
}

async function main() {
  console.log(await walk(ROOT_PACKAGES));
}

main();
