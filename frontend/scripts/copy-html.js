import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const builtHtmlPath = path.join(__dirname, '../../healthcare/public/frontend/index.html');
const wwwHtmlPath = path.join(__dirname, '../../healthcare/www/health_frontend.html');

try {
  // Read the built HTML
  const builtHtml = fs.readFileSync(builtHtmlPath, 'utf8');
  
  // Extract the hashed filenames (they will be in the format /assets/healthcare/frontend/assets/index-[hash].js)
  const jsMatch = builtHtml.match(/src=["']([^"']*assets\/index-[^"']*\.js)["']/);
  const cssMatch = builtHtml.match(/href=["']([^"']*assets\/index-[^"']*\.css)["']/);
  
  if (!jsMatch || !cssMatch) {
    console.log('Could not find hashed filenames in built HTML, using static paths');
    process.exit(0);
  }
  
  // Extract just the filename part (e.g., "assets/index-abc123.js")
  const jsFilename = jsMatch[1].replace(/^.*\/assets\//, 'assets/');
  const cssFilename = cssMatch[1].replace(/^.*\/assets\//, 'assets/');
  
  // Read the www HTML
  let wwwHtml = fs.readFileSync(wwwHtmlPath, 'utf8');
  
  // Update the paths while preserving Frappe template variables
  wwwHtml = wwwHtml.replace(
    /src=["'][^"']*assets\/index[^"']*\.js["']/g,
    `src="/assets/healthcare/frontend/${jsFilename}"`
  );
  
  wwwHtml = wwwHtml.replace(
    /href=["'][^"']*assets\/index[^"']*\.css["']/g,
    `href="/assets/healthcare/frontend/${cssFilename}"`
  );
  
  // Write back
  fs.writeFileSync(wwwHtmlPath, wwwHtml);
  console.log('Updated www/health_frontend.html with hashed filenames');
} catch (error) {
  console.error('Error updating HTML:', error.message);
  process.exit(1);
}

