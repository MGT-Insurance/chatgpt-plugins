> **Generated from [MGT-Insurance/agentic-plugins-main](https://github.com/MGT-Insurance/agentic-plugins-main). Don't commit here.** Open pull requests in that repository. The promote workflow overwrites this repository, so a direct commit is lost.

# MGT Insurance plugins for ChatGPT

This repository publishes MGT Insurance's ChatGPT plugins. Each plugin lives in its own folder under `chatgpt/`.

| Plugin | Description |
|---|---|
| [`mgt-quoting`](chatgpt/mgt-quoting) | Draft MGT commercial insurance quotes from ChatGPT. |

## The ZIP

`mgt-quoting.zip` at the repository root is the upload package for `chatgpt/mgt-quoting`. It holds the contents of that folder, with `plugin.json` at the ZIP root, which is what OpenAI's plugin portal requires. The promote workflow rebuilds it from the plugin folder, so don't edit it by hand.

## Upload the plugin

1. Download `mgt-quoting.zip`.
2. In OpenAI's plugin portal, choose **Plugins** > **Upload new or existing plugin**.
3. Upload the ZIP and follow the portal's checks.

The plugin signs in with MGT's Auth0 app. If the app has a client secret, enter it in the portal and never store it in this repository.

## Important limits

- ChatGPT drafts, and results can be wrong.
- A licensed person reviews every quote.
- Binding happens in Shadowfax, MGT's agent portal, never in ChatGPT.
