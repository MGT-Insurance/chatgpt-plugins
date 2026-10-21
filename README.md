> **Generated from [MGT-Insurance/agentic-plugins-main](https://github.com/MGT-Insurance/agentic-plugins-main). Don't commit here.** Open pull requests in that repository. The promote workflow overwrites this repository, so a direct commit is lost.

# MGT Insurance plugins for ChatGPT

This repository publishes MGT Insurance's ChatGPT plugins. Each plugin lives in its own folder under `chatgpt/`.

| Plugin | Description |
|---|---|
| [`mgt-quoting`](chatgpt/mgt-quoting) | For insurance agents: quote MGT small-business commercial insurance from ChatGPT. |

## The two ZIPs

OpenAI expects a different manifest layout for each way you add a plugin, so each [release](https://github.com/MGT-Insurance/chatgpt-plugins/releases) publishes two ZIPs:

| ZIP | Use it for | Manifests at the ZIP root | Manifests come from |
|---|---|---|---|
| `mgt-quoting-upload.zip` | OpenAI's plugin portal | `plugin.json` and `mcp.json` | `chatgpt/mgt-quoting-upload/` |
| `mgt-quoting-desktop.zip` | ChatGPT desktop | `.codex-plugin/plugin.json` and `.mcp.json` | `chatgpt/mgt-quoting/` |

Both ZIPs also contain the same `skills/` and `assets/` folders from `chatgpt/mgt-quoting/`. The portal manifests live in `chatgpt/mgt-quoting-upload/` because a root `plugin.json` or `mcp.json` in the plugin folder stops ChatGPT desktop from registering the MCP server when you install the plugin from a marketplace. A workflow in this repository builds the ZIPs and creates a release for each new plugin `version`, so don't edit a ZIP by hand. The build fails if the two manifest sets disagree on the plugin name, version, description, author, display text, MCP server URL, or scopes, or if the plugin folder contains a root `plugin.json` or `mcp.json`.

## Upload the plugin to the portal

1. Download the [latest `mgt-quoting-upload.zip`](https://github.com/MGT-Insurance/chatgpt-plugins/releases/latest/download/mgt-quoting-upload.zip).
2. In OpenAI's plugin portal, choose **Plugins** > **Upload new or existing plugin**.
3. Upload the ZIP and follow the portal's checks.
4. When the portal asks for the OAuth client secret, enter the secret for the MGT "ChatGPT directory" Auth0 app.

The upload ZIP signs in with the Auth0 app whose `clientId` is set in `mcp.json`. The client secret is not in this repository.

## Install the plugin in ChatGPT desktop

Add this repository as a marketplace, then install the plugin from it:

1. In ChatGPT desktop, add a plugin marketplace with the source `MGT-Insurance/chatgpt-plugins`.
2. Install **MGT Quoting** from that marketplace.
3. Sign in when ChatGPT prompts you.

If you can't add a marketplace, download the [latest `mgt-quoting-desktop.zip`](https://github.com/MGT-Insurance/chatgpt-plugins/releases/latest/download/mgt-quoting-desktop.zip) and install the ZIP in ChatGPT desktop instead.

The desktop plugin signs in with the MGT external-testers Auth0 app, a public client that has no secret, so you don't enter a secret. The sign-in redirects to the loopback address `http://127.0.0.1:14551/callback`, so keep port 14551 free on your machine during sign-in.

## Important limits

- Results can be wrong.
- Binding happens in MGT's portal, never in ChatGPT.
