import * as fs from 'fs';
interface RippledConfig {
  [section: string]: string[] | Record<string, string>;
}
export function parseRippledConfig(filePath: string): RippledConfig {
  const config: RippledConfig = {};
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split(/\r?\n/);
  let currentSection: string | null = null;
  lines.forEach((line) => {
    line = line.trim();
    // Ignore empty lines and comments
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      return;
    }
    // Section header
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      config[currentSection] = [];
    } else if (currentSection) {
      // Handle list-like sections (e.g., `[ips]`)
      if (!line.includes('=')) {
        (config[currentSection] as string[]).push(line);
      } else {
        // Handle key-value pairs
        const [key, value] = line.split('=').map((part) => part.trim());
        if (typeof config[currentSection] === 'object') {
          (config[currentSection] as Record<string, string>)[key] = value || '';
        }
      }
    }
  });
  return config;
}
