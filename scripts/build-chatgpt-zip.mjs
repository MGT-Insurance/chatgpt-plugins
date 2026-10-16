#!/usr/bin/env node
// Usage: node scripts/build-chatgpt-zip.mjs <plugin-dir> <out-dir>
//
// Builds the two ZIPs that OpenAI expects from one ChatGPT plugin folder (for example chatgpt/mgt-quoting)
// and its sibling upload folder (chatgpt/mgt-quoting-upload):
//   <name>-upload.zip   plugin.json + mcp.json from <plugin-dir>-upload, plus skills/ + assets/ from <plugin-dir>
//                       for OpenAI's plugin portal
//   <name>-desktop.zip  .codex-plugin/plugin.json + .mcp.json + skills/ + assets/ from <plugin-dir>
//                       for ChatGPT desktop
// <name> is the `name` in <plugin-dir>-upload/plugin.json.
//
// The portal manifests live outside the plugin folder on purpose. A plugin.json or mcp.json at the root of the
// plugin folder stops ChatGPT desktop and Codex from registering the MCP server when someone installs the plugin
// from a marketplace, so the build throws if either file exists there.
//
// Both ZIPs come from the same sources, so the build checks that the two manifest pairs agree on name, version,
// description, author, interface, server URL, and scopes. A mismatch throws before any file is written. The ZIPs
// are deterministic: files are sorted and carry a fixed timestamp, so the same input produces the same bytes.
// The release workflow in MGT-Insurance/chatgpt-plugins runs this script, and promote/promote.mjs imports
// buildChatgptZips to check that a plugin zips.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

const UPLOAD_MANIFESTS = ['plugin.json', 'mcp.json']; // read from the sibling <plugin-dir>-upload folder
const DESKTOP_MANIFESTS = ['.codex-plugin/plugin.json', '.mcp.json'];
const SHARED_DIRS = ['skills', 'assets'];

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const readJson = (base, name) => JSON.parse(readFileSync(join(base, name), 'utf8'));

const uploadDirFor = (pluginDir) => `${pluginDir}-upload`;

const show = (value) => JSON.stringify(value);

/** Throws when the plugin folder holds a portal manifest, or the upload folder or a manifest is missing. */
function checkLayout(base, uploadBase) {
  for (const name of UPLOAD_MANIFESTS) {
    if (existsSync(join(base, name))) {
      throw new Error(
        `${join(base, name)} must not exist: a root ${name} in the plugin folder stops ChatGPT desktop from registering the MCP server on a marketplace install. Move it to ${join(uploadBase, name)}.`,
      );
    }
  }
  if (!existsSync(uploadBase)) {
    throw new Error(`${uploadBase} does not exist. Put the portal plugin.json and mcp.json there.`);
  }
  const required = [...UPLOAD_MANIFESTS.map((name) => join(uploadBase, name)), ...DESKTOP_MANIFESTS.map((name) => join(base, name))];
  for (const file of required) {
    if (!existsSync(file)) throw new Error(`${file} does not exist`);
  }
}

/** Throws a message that names the drifting field when the upload and desktop manifests disagree. */
function checkDrift(base, uploadBase) {
  const uploadPlugin = readJson(uploadBase, 'plugin.json');
  const desktopPlugin = readJson(base, '.codex-plugin/plugin.json');
  const uploadMcp = readJson(uploadBase, 'mcp.json');
  const desktopMcp = readJson(base, '.mcp.json');
  const uploadPluginFile = join(uploadBase, 'plugin.json');
  const uploadMcpFile = join(uploadBase, 'mcp.json');
  const desktopPluginFile = join(base, '.codex-plugin/plugin.json');
  const desktopMcpFile = join(base, '.mcp.json');

  const problems = [];
  const compare = (field, upload, desktop, uploadFile, desktopFile) => {
    if (!isDeepStrictEqual(upload, desktop)) {
      problems.push(`${field}: ${uploadFile} has ${show(upload)} but ${desktopFile} has ${show(desktop)}`);
    }
  };

  for (const field of ['name', 'version', 'description', 'author']) {
    compare(field, uploadPlugin[field], desktopPlugin[field], uploadPluginFile, desktopPluginFile);
  }
  // Compare the interface key by key so the message names the drifting field, such as interface.displayName.
  const uploadInterface = uploadPlugin.extensions?.['com.openai']?.interface ?? {};
  const desktopInterface = desktopPlugin.interface ?? {};
  for (const key of new Set([...Object.keys(uploadInterface), ...Object.keys(desktopInterface)])) {
    compare(
      `interface.${key}`,
      uploadInterface[key],
      desktopInterface[key],
      `${uploadPluginFile} extensions["com.openai"].interface`,
      `${desktopPluginFile} interface`,
    );
  }

  const uploadServers = uploadMcp.mcpServers ?? {};
  const desktopServers = desktopMcp.mcpServers ?? {};
  compare(
    'mcpServers keys',
    Object.keys(uploadServers).sort(),
    Object.keys(desktopServers).sort(),
    uploadMcpFile,
    desktopMcpFile,
  );
  for (const key of Object.keys(uploadServers)) {
    if (!(key in desktopServers)) continue;
    const upload = uploadServers[key];
    const desktop = desktopServers[key];
    compare(`mcpServers.${key}.url`, upload.url, desktop.url, uploadMcpFile, desktopMcpFile);
    compare(
      `mcpServers.${key} scopes (defaultScopes vs scopes)`,
      upload.extensions?.['com.openai']?.auth?.defaultScopes,
      desktop.scopes,
      uploadMcpFile,
      desktopMcpFile,
    );
  }

  if (problems.length) {
    throw new Error(
      `the upload manifests in ${uploadBase} and the desktop manifests in ${base} have drifted. Make them match:\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );
  }
  return uploadPlugin.name;
}

/** Lists each manifest from `manifestBase`, then every skills/ and assets/ file from `base`. */
const toEntries = (base, manifestBase, names) => {
  const entries = [];
  for (const name of names) entries.push({ name, file: join(manifestBase, name) });
  for (const dir of SHARED_DIRS) {
    const root = join(base, dir);
    if (!existsSync(root)) continue;
    for (const file of listFiles(root)) {
      if (statSync(file).isFile() && basename(file) !== '.DS_Store') {
        entries.push({ name: relative(base, file).split(sep).join('/'), file });
      }
    }
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : 1));
};

function writeZip(entries, outputZip) {
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
}

/**
 * Reads the portal manifests from `<pluginDir>-upload` and everything else from `pluginDir`.
 * Checks the folder layout and the manifests for drift, then writes `<name>-upload.zip` and `<name>-desktop.zip` into `outDir`.
 * Returns the entry names of each ZIP and the two ZIP paths.
 */
export function buildChatgptZips(pluginDir, outDir) {
  const base = resolve(pluginDir);
  const uploadBase = uploadDirFor(base);
  checkLayout(base, uploadBase);
  const name = checkDrift(base, uploadBase);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });

  const uploadZip = join(out, `${name}-upload.zip`);
  const desktopZip = join(out, `${name}-desktop.zip`);
  // toEntries keeps dotfiles and dot-directories (.codex-plugin/, .mcp.json); only Finder metadata is dropped.
  const uploadEntries = toEntries(base, uploadBase, UPLOAD_MANIFESTS);
  const desktopEntries = toEntries(base, base, DESKTOP_MANIFESTS);
  writeZip(uploadEntries, uploadZip);
  writeZip(desktopEntries, desktopZip);
  return {
    upload: uploadEntries.map((entry) => entry.name),
    desktop: desktopEntries.map((entry) => entry.name),
    uploadZip,
    desktopZip,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pluginDir, outDir] = process.argv.slice(2);
  if (!pluginDir || !outDir) {
    console.error('usage: build-chatgpt-zip.mjs <plugin-dir> <out-dir>');
    process.exit(1);
  }
  try {
    const result = buildChatgptZips(pluginDir, outDir);
    console.log(`build-chatgpt-zip: wrote ${result.uploadZip} (${result.upload.length} files, plugin.json and mcp.json at the root)`);
    console.log(
      `build-chatgpt-zip: wrote ${result.desktopZip} (${result.desktop.length} files, .codex-plugin/plugin.json and .mcp.json at the root)`,
    );
  } catch (error) {
    console.error(`build-chatgpt-zip: ${error.message}`);
    process.exit(1);
  }
}
