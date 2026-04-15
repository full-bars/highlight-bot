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
        const parts = message.content.split(' ');
        let keyword;
        let channelIdToLimit = null;

        const channelMention = parts[parts.length - 1].match(/^<#(\d+)>$/);
        if (channelMention) {
            channelIdToLimit = channelMention[1];
            keyword = parts.slice(1, -1).join(' ').toLowerCase();
        } else {
            keyword = parts.slice(1).join(' ').toLowerCase();
        }

        if (!userKeywords[userId]) userKeywords[userId] = [];
        
        const alreadyExists = userKeywords[userId].some(kwObj => 
            kwObj.keyword === keyword && kwObj.channelId === channelIdToLimit
        );

        if (!alreadyExists) {
            userKeywords[userId].push({ keyword: keyword, channelId: channelIdToLimit });
            fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
            const channelText = channelIdToLimit ? ` in <#${channelIdToLimit}>` : "";
            message.reply(`Added keyword: **${keyword}**${channelText}`);
        } else {
            message.reply('That keyword is already being tracked with those settings.');
        }
        return;
    }

    // Command to remove a keyword
    if (message.content.startsWith('!removekeyword ')) {
        const parts = message.content.split(' ');
        let keyword;
        let channelIdToRemove = null;

        const channelMention = parts[parts.length - 1].match(/^<#(\d+)>$/);
        if (channelMention) {
            channelIdToRemove = channelMention[1];
            keyword = parts.slice(1, -1).join(' ').toLowerCase();
        } else {
            keyword = parts.slice(1).join(' ').toLowerCase();
        }

        if (userKeywords[userId]) {
            const originalLength = userKeywords[userId].length;
            userKeywords[userId] = userKeywords[userId].filter(kwObj => 
                !(kwObj.keyword === keyword && kwObj.channelId === channelIdToRemove)
            );
            
            if (userKeywords[userId].length < originalLength) {
                fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
                const channelText = channelIdToRemove ? ` in <#${channelIdToRemove}>` : "";
                message.reply(`Removed keyword: **${keyword}**${channelText}`);
            } else {
                message.reply('That keyword was not in your list.');
            }
        } else {
            message.reply('You have no keywords.');
        }
        return;
    }

    // Command to list keywords
    if (message.content === '!listkeywords') {
        if (userKeywords[userId] && userKeywords[userId].length > 0) {
            const list = userKeywords[userId].map(kw => 
                `- **${kw.keyword}**${kw.channelId ? ` in <#${kw.channelId}>` : ""}`
            ).join('\n');
            message.reply(`Your keywords:\n${list}`);
        } else {
            message.reply('You have no keywords tracked.');
        }
        return;
    }

    // Check for keyword alerts for all tracked users
    Object.entries(userKeywords).forEach(async ([trackedUser, userKeywordList]) => {
        if (trackedUser === userId) return;

        const foundKeywordObj = userKeywordList.find(kwObj => {
            if (kwObj.channelId && kwObj.channelId !== channelId) return false;
            return new RegExp(`\\b${kwObj.keyword}\\b`, 'i').test(message.content);
        });

        if (!foundKeywordObj) return;

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
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({
                    name: `In ${message.guild.name} • #${message.channel.name}`,
                    iconURL: message.guild.iconURL() || ''
                })
                .setDescription(`You were highlighted with the word: **${foundKeywordObj.keyword}**`)
                .addFields(
                    { name: `${message.author.tag}`, value: message.content || '*No message content*' },
                    { name: 'Source Message', value: `[Click to jump](${messageLink})` }
                )
                .setFooter({ text: 'Triggered' })
                .setTimestamp();

            const userObj = await client.users.fetch(trackedUser);
            await userObj.send({ embeds: [embed] });
            console.log(`Sent DM to ${userObj.tag} for keyword "${foundKeywordObj.keyword}" in channel ${message.channel.name}.`);
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
