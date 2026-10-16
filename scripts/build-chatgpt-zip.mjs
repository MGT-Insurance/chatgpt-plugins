#!/usr/bin/env node
// Usage: node scripts/build-chatgpt-zip.mjs <plugin-dir> <output.zip>
//
// Zips the CONTENTS of a ChatGPT plugin folder (for example chatgpt/mgt-quoting) so that
// .codex-plugin/plugin.json and .mcp.json sit at the ZIP root, the layout OpenAI's plugin portal signs in with.
// The ZIP is deterministic: files are sorted and carry a fixed timestamp, so the same
// input produces the same bytes. The release workflow in MGT-Insurance/chatgpt-plugins runs
// this script, and promote/promote.mjs imports buildChatgptZip to check that a plugin zips.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

export function buildChatgptZip(pluginDir, outputZip) {
  const base = resolve(pluginDir);
  if (!existsSync(join(base, '.codex-plugin', 'plugin.json'))) {
    throw new Error(`${base} has no .codex-plugin/plugin.json at its root`);
  }
  // listFiles keeps dotfiles and dot-directories (.codex-plugin/, .mcp.json); only Finder metadata is dropped.
  const entries = listFiles(base)
    .map((file) => ({ name: relative(base, file).split(sep).join('/'), file }))
    .filter(({ file }) => statSync(file).isFile() && basename(file) !== '.DS_Store')
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, file } of entries) {
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // made by: Unix, spec 3.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(UNIX_FILE_MODE, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + packed.length;
  }

  const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outputZip, Buffer.concat([...locals, ...centrals, end]));
  return entries.map(({ name }) => name);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pluginDir, outputZip] = process.argv.slice(2);
  if (!pluginDir || !outputZip) {
    console.error('usage: build-chatgpt-zip.mjs <plugin-dir> <output.zip>');
    process.exit(1);
  }
  const names = buildChatgptZip(pluginDir, resolve(outputZip));
  console.log(`build-chatgpt-zip: wrote ${outputZip} (${names.length} files, .codex-plugin/plugin.json at the root)`);
}
