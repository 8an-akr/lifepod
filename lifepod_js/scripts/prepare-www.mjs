// Builds the clean `www/` folder that Capacitor bundles into the APK.
// The app source lives flat in this directory; Capacitor needs an isolated
// web root whose entry file is `index.html`, so we copy the relevant files
// (renaming lifepod.html -> index.html) and leave everything else behind.
import { mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www  = join(root, "www");

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

// [source, destination-in-www]
const files = [
  ["lifepod.html", "index.html"],
  ["lifepod.css", "lifepod.css"],
  ["lifepod.js", "lifepod.js"],
  ["manifest.json", "manifest.json"],
  ["icon.svg", "icon.svg"],
  ["icon-192.png", "icon-192.png"],
  ["icon-512.png", "icon-512.png"],
  ["apple-touch-icon.png", "apple-touch-icon.png"]
];

let copied = 0;
for (const [src, dest] of files) {
  const from = join(root, src);
  if (existsSync(from)) {
    copyFileSync(from, join(www, dest));
    copied++;
  } else {
    console.warn(`  ! skipped missing file: ${src}`);
  }
}

console.log(`www/ prepared (${copied} files). Entry: www/index.html`);
