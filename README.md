# Telegram Bot Extractor

A Chrome extension that scans the current web page for Telegram bot links, tokens, chat IDs, and API URLs.  
**Intended for security researchers and analysts investigating phishing or suspicious pages.**

## Features

- Extracts:
  - Telegram bot links (`t.me/...`)
  - Bot tokens (`123456789:AA...`)
  - Chat IDs
- Copy results to clipboard with one click
- Clear all results easily

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

## Usage

1. Navigate to a web page you want to scan.
2. Click the Telegram Bot Extractor icon in your browser toolbar.
3. The extension will scan the page and display any Telegram bot information found.
4. Use the **Copy** buttons to copy results, or **Clear All** to reset.

## Permissions

- `activeTab`: To access the content of the current page.
- `scripting`: To inject the extraction script.
- `clipboardWrite`: To allow copying results.

## Security & Privacy

- **No data is sent anywhere**: All extraction happens locally in your browser.
- **Do not use extracted tokens for unauthorized access.**  
  This tool is for research and reporting only.
- **Responsible Disclosure**: If you find active phishing bots, report them to [Telegram Abuse](https://telegram.org/abuse) or relevant authorities.

## Disclaimer

This tool is intended for ethical research and educational purposes only.  
The author is not responsible for any misuse.

## License

MIT License (see [here](https://opensource.org/licenses/MIT) or the [LICENSE](LICENSE) file)