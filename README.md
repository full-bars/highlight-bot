# 🚀 Highlight Bot v1.2.0

A powerful, AI-enhanced Discord notification bot that DMs you when specific keywords are mentioned. 

## ✨ Features

- **Slash Command Management**: Easy to use `/keywords` and `/settings` commands.
- **🤖 AI Intelligent Filtering**: Use Google Gemini to filter notifications based on your specific context (e.g., "only actual emergency reports").
- **Smart Notifications**: Automatically skips DMs if you're already active in the channel.
- **Contextual Alerts**: DMs include the 3 messages sent before the trigger to provide instant context.
- **Advanced Matching**: Supports Strict (whole word), Loose (anywhere), and Exact (case-sensitive) modes.
- **Cooldowns**: Prevent spam by setting a per-keyword cooldown.
- **Blacklists**: Ignore specific users or channels entirely.
- **Snooze**: Temporarily disable all notifications.
- **Stats**: Track your most frequent highlights.
- **Health Monitoring**: Check bot uptime and latency with `/status`.

## 🛠 Commands

### `/keywords`
- `add <keyword> [channel] [ai_context] [mode] [cooldown]`: Add a new keyword.
- `remove <keyword> [channel]`: Stop tracking a keyword.
- `list`: Show all your tracked keywords and their settings.

### `/settings`
- `snooze <minutes>`: Stop all DMs for a set duration.
- `ignore_user <user>`: Stop getting alerts triggered by a specific person.
- `ignore_channel <channel>`: Stop getting alerts from a specific channel.
- `view`: Check your current ignore lists and snooze status.

### `/stats`
- View a summary of how many times your keywords have triggered.

### `/status`
- Check bot uptime, memory usage, latency, and overall usage stats.

### `/help`
- Displays a detailed guide on how to use all features.

## ⚙️ Setup

1. **Environment Variables**: Create a `.env` file with:
   ```env
   TOKEN=your_discord_bot_token
   GEMINI_API_KEY=your_google_gemini_api_key
   ```
2. **Install Dependencies**: `npm install`
3. **Run**: `node index.js`

## 🔒 Security
The bot uses a local `keywords.json` to store settings. Ensure your `.env` is ignored by git (already configured in this repo).
