const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
require('dotenv').config(); // Loads bot token from .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageTyping // Needed for typing detection
    ]
});

console.log("Loaded .env file. Token found:", process.env.TOKEN ? "YES" : "NO");

const KEYWORDS_FILE = 'keywords.json';
let userKeywords = {};

// Track recent activity (messages and typing)
const recentMessages = new Map();
const recentTypers = new Map();
const ACTIVITY_THRESHOLD = 60000; // 60 seconds

// Load keywords from file if it exists
if (fs.existsSync(KEYWORDS_FILE)) {
    userKeywords = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Listen for new messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const channelId = message.channel.id;

    recentMessages.set(userId, { channel: channelId, timestamp: Date.now() });

    // Command to add a keyword
    if (message.content.startsWith('!addkeyword ')) {
        const keyword = message.content.split(' ').slice(1).join(' ').toLowerCase();
        if (!userKeywords[userId]) userKeywords[userId] = [];
        if (!userKeywords[userId].includes(keyword)) {
            userKeywords[userId].push(keyword);
            fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
            message.reply(`Added keyword: ${keyword}`);
        } else {
            message.reply('That keyword is already being tracked.');
        }
        return;
    }

    // Command to remove a keyword
    if (message.content.startsWith('!removekeyword ')) {
        const keyword = message.content.split(' ').slice(1).join(' ').toLowerCase();
        if (userKeywords[userId] && userKeywords[userId].includes(keyword)) {
            userKeywords[userId] = userKeywords[userId].filter(word => word !== keyword);
            fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
            message.reply(`Removed keyword: ${keyword}`);
        } else {
            message.reply('That keyword is not in your list.');
        }
        return;
    }

    // Check for keyword alerts for all tracked users
    Object.entries(userKeywords).forEach(async ([trackedUser, keywords]) => {
        if (trackedUser === userId) return;

        // Ensure keywords match whole words only
        if (!keywords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(message.content))) return;

        const guildMember = message.guild.members.cache.get(trackedUser);
        if (!guildMember) {
            console.log(`DEBUG: Tracked user ${trackedUser} not found in guild ${message.guild.id}.`);
            return;
        }

        const permissions = message.channel.permissionsFor(guildMember);
        if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel)) {
            console.log(`DEBUG: Skipping notification for user ${trackedUser} - lacks VIEW_CHANNEL permission in channel ${message.channel.name} (ID: ${message.channel.id}).`);
            return;
        }

        try {
            const foundKeyword = keywords.find(word => new RegExp(`\\b${word}\\b`, 'i').test(message.content));
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({
                    name: `In ${message.guild.name} • #${message.channel.name}`,
                    iconURL: message.guild.iconURL() || ''
                })
                .setDescription(`You were highlighted with the word: **${foundKeyword}**`)
                .addFields(
                    { name: `${message.author.tag}`, value: message.content || '*No message content*' },
                    { name: 'Source Message', value: `[Click to jump](${messageLink})` }
                )
                .setFooter({ text: 'Triggered' })
                .setTimestamp();

            const userObj = await client.users.fetch(trackedUser);
            await userObj.send({ embeds: [embed] });
            console.log(`Sent DM to ${userObj.tag} for keyword "${foundKeyword}" in channel ${message.channel.name}.`);
        } catch (error) {
            console.error(`DEBUG: Could not send DM to user ${trackedUser}: ${error}`);
        }
    });
});

// Track typing activity to avoid duplicate notifications
client.on('typingStart', (channel, user) => {
    if (!channel || !user || !user.id) return;
    recentTypers.set(user.id, { channel: channel.id, timestamp: Date.now() });
});

client.login(process.env.TOKEN)
    .then(() => console.log("Bot login successful."))
    .catch(err => console.error("Bot login failed:", err));