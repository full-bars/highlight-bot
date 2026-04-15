const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
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

// Define Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('keywords')
        .setDescription('Manage your keywords')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new keyword to track')
                .addStringOption(option => option.setName('keyword').setDescription('The keyword to track').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('Limit to a specific channel (optional)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a tracked keyword')
                .addStringOption(option => option.setName('keyword').setDescription('The keyword to remove').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('The channel the keyword was limited to (if any)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all your tracked keywords')),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Handle Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;
    const userId = user.id;

    if (commandName === 'keywords') {
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const keyword = options.getString('keyword').toLowerCase();
            const channel = options.getChannel('channel');
            const channelIdToLimit = channel ? channel.id : null;

            if (!userKeywords[userId]) userKeywords[userId] = [];

            const alreadyExists = userKeywords[userId].some(kwObj => 
                kwObj.keyword === keyword && kwObj.channelId === channelIdToLimit
            );

            if (!alreadyExists) {
                userKeywords[userId].push({ keyword: keyword, channelId: channelIdToLimit });
                fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
                const channelText = channelIdToLimit ? ` in <#${channelIdToLimit}>` : "";
                await interaction.reply({ content: `Added keyword: **${keyword}**${channelText}`, ephemeral: true });
            } else {
                await interaction.reply({ content: 'That keyword is already being tracked with those settings.', ephemeral: true });
            }
        } 
        
        else if (subcommand === 'remove') {
            const keyword = options.getString('keyword').toLowerCase();
            const channel = options.getChannel('channel');
            const channelIdToRemove = channel ? channel.id : null;

            if (userKeywords[userId]) {
                const originalLength = userKeywords[userId].length;
                userKeywords[userId] = userKeywords[userId].filter(kwObj => 
                    !(kwObj.keyword === keyword && kwObj.channelId === channelIdToRemove)
                );
                
                if (userKeywords[userId].length < originalLength) {
                    fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
                    const channelText = channelIdToRemove ? ` in <#${channelIdToRemove}>` : "";
                    await interaction.reply({ content: `Removed keyword: **${keyword}**${channelText}`, ephemeral: true });
                } else {
                    await interaction.reply({ content: 'That keyword was not in your list.', ephemeral: true });
                }
            } else {
                await interaction.reply({ content: 'You have no keywords.', ephemeral: true });
            }
        }

        else if (subcommand === 'list') {
            if (userKeywords[userId] && userKeywords[userId].length > 0) {
                const list = userKeywords[userId].map(kw => 
                    `- **${kw.keyword}**${kw.channelId ? ` in <#${kw.channelId}>` : ""}`
                ).join('\n');
                
                const embed = new EmbedBuilder()
                    .setTitle('Your Tracked Keywords')
                    .setDescription(list)
                    .setColor(0x5865F2);
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: 'You have no keywords tracked.', ephemeral: true });
            }
        }
    }
});

// Listen for new messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const channelId = message.channel.id;

    recentMessages.set(userId, { channel: channelId, timestamp: Date.now() });

    // Legacy Command Support (Keep existing logic if you want both, or remove if moving entirely to slash)
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
        const alreadyExists = userKeywords[userId].some(kwObj => kwObj.keyword === keyword && kwObj.channelId === channelIdToLimit);

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
            userKeywords[userId] = userKeywords[userId].filter(kwObj => !(kwObj.keyword === keyword && kwObj.channelId === channelIdToRemove));
            if (userKeywords[userId].length < originalLength) {
                fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(userKeywords, null, 2));
                const channelText = channelIdToRemove ? ` in <#${channelIdToRemove}>` : "";
                message.reply(`Removed keyword: **${keyword}**${channelText}`);
            } else {
                message.reply('That keyword was not in your list.');
            }
        }
        return;
    }

    if (message.content === '!listkeywords') {
        if (userKeywords[userId] && userKeywords[userId].length > 0) {
            const list = userKeywords[userId].map(kw => `- **${kw.keyword}**${kw.channelId ? ` in <#${kw.channelId}>` : ""}`).join('\n');
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
        if (!guildMember) return;

        const permissions = message.channel.permissionsFor(guildMember);
        if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel)) return;

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
