# Changelog

All notable changes to Highlight Bot are documented in this file.

## [1.2.3] - 2026-06-11

### Changed
- Standardize message link label to "Source message" for consistency across all versions

## [1.2.2] - 2026-04-15

### Added
- Hard permission checks at the start of trigger loop for improved security
- Hardcoded filter to ignore sensitive channel names (staff, mod, admin, log)
- Complete permission-based privacy implementation

### Fixed
- Resolve slash command duplicates through deep cleanup

## [1.2.1] - 2026-04-15

### Added
- Improved channel selection UI with better dropdown support
- Singular `/keyword` command alias (in addition to `/keywords`)
- Enhanced Discord integration for channel picking

## [1.1.0] - 2026-04-14

### Added
- Smart notification system that skips DMs if user is active in the channel
- Contextual alerts showing the 3 messages before the trigger
- Snooze feature to temporarily disable all notifications
- Blacklist functionality for ignoring specific users or channels
- Per-keyword cooldowns to prevent spam
- Three matching modes: Strict (whole word), Loose (anywhere), Exact (case-sensitive)
- Statistics tracking for most frequent highlights
- Advanced channel support (Text, Announcement, Voice, Threads, Forums, Media)

### Features
- Core keyword tracking functionality
- Slash command interface (`/keyword`, `/settings`)
- Channel-specific keyword configuration
- User and channel blacklisting

## [1.0.0] - 2026-04-13

### Added
- Initial release of Highlight Bot
- Basic keyword tracking via slash commands
- Discord.js integration for message monitoring
- Google Gemini AI for optional context-based filtering
