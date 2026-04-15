const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageTyping
    ]
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const DATA_FILE = 'keywords.json';
let userData = { users: {} };

// --- DATA MIGRATION ---
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!rawData.users) {
            userData = { users: {} };
        } else {
            userData = rawData;
        }
    } catch (e) {
        console.error("Error loading keywords.json:", e);
    }
}

const saveData = () => fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));

// Track recent activity
const recentMessages = new Map();
const recentTypers = new Map();

// --- SLASH COMMANDS DEFINITION ---
const keywordCommandDefinition = new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('Manage your keywords')
    .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add a keyword')
        .addStringOption(opt => opt.setName('keyword').setDescription('Keyword to track').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Select a channel from the list').addChannelTypes(
            ChannelType.GuildText, 
            ChannelType.GuildAnnouncement, 
            ChannelType.GuildVoice, 
            ChannelType.GuildStageVoice, 
            ChannelType.PublicThread, 
            ChannelType.PrivateThread, 
            ChannelType.AnnouncementThread,
            ChannelType.GuildForum,
            ChannelType.GuildMedia
        ))
        .addStringOption(opt => opt.setName('channel_id').setDescription('OR paste a channel ID directly if it won\'t show up in the list'))
        .addStringOption(opt => opt.setName('ai_context').setDescription('AI filtering (e.g., "only actual emergency reports")'))
        .addStringOption(opt => opt.setName('mode').setDescription('Matching mode').addChoices(
            { name: 'Strict (Whole Word)', value: 'strict' },
            { name: 'Loose (Anywhere)', value: 'loose' },
            { name: 'Exact (Case Sensitive)', value: 'exact' }
        ))
        .addIntegerOption(opt => opt.setName('cooldown').setDescription('Cooldown in minutes')))
    .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Remove a keyword')
        .addStringOption(opt => opt.setName('keyword').setDescription('Keyword to remove').setRequired(true).setAutocomplete(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel setting it was saved with'))
        .addStringOption(opt => opt.setName('channel_id').setDescription('OR paste a channel ID if it was saved with one')))
    .addSubcommand(sub => sub
        .setName('list')
        .setDescription('List your keywords'));

const commands = [
    keywordCommandDefinition,
    // Add singular alias
    new SlashCommandBuilder().setName('keyword').setDescription('Alias for /keywords')
        .addSubcommand(sub => sub.setName('add').setDescription('Add a keyword').addStringOption(opt => opt.setName('keyword').setDescription('Keyword to track').setRequired(true)).addChannelOption(opt => opt.setName('channel').setDescription('Select a channel from the list').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread, ChannelType.GuildForum, ChannelType.GuildMedia)).addStringOption(opt => opt.setName('channel_id').setDescription('OR paste a channel ID directly')).addStringOption(opt => opt.setName('ai_context').setDescription('AI filtering (e.g., "only actual emergency reports")')).addStringOption(opt => opt.setName('mode').setDescription('Matching mode').addChoices({ name: 'Strict (Whole Word)', value: 'strict' }, { name: 'Loose (Anywhere)', value: 'loose' }, { name: 'Exact (Case Sensitive)', value: 'exact' })).addIntegerOption(opt => opt.setName('cooldown').setDescription('Cooldown in minutes')))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove a keyword').addStringOption(opt => opt.setName('keyword').setDescription('Keyword to remove').setRequired(true).setAutocomplete(true)).addChannelOption(opt => opt.setName('channel').setDescription('Channel setting it was saved with')).addStringOption(opt => opt.setName('channel_id').setDescription('OR paste a channel ID')))
        .addSubcommand(sub => sub.setName('list').setDescription('List your keywords')),

    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Bot settings')
        .addSubcommand(sub => sub
            .setName('snooze')
            .setDescription('Snooze notifications')
            .addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes to snooze').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('ignore_user')
            .setDescription('Ignore alerts from a user')
            .addUserOption(opt => opt.setName('user').setDescription('User to ignore').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('ignore_channel')
            .setDescription('Ignore alerts from a channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Select a channel from the list').addChannelTypes(
                ChannelType.GuildText, 
                ChannelType.GuildAnnouncement, 
                ChannelType.GuildVoice, 
                ChannelType.GuildStageVoice, 
                ChannelType.PublicThread, 
                ChannelType.PrivateThread, 
                ChannelType.AnnouncementThread,
                ChannelType.GuildForum,
                ChannelType.GuildMedia
            ))
            .addStringOption(opt => opt.setName('channel_id').setDescription('OR paste a channel ID directly')))
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('View your ignore lists and snooze status')),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your highlight statistics'),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot health and uptime'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Detailed guide on how to use Highlight Bot')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        console.log('Started refreshing application (/) commands globally.');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands globally.');

        // Clear guild-level commands to prevent duplicates
        client.guilds.cache.forEach(async (guild) => {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
            } catch (e) { /* Ignore errors for guilds where we lack perms */ }
        });

    } catch (e) { console.error(e); }
});

// --- HELPER FUNCTIONS ---
function getUser(userId) {
    if (!userData.users[userId]) {
        userData.users[userId] = {
            keywords: [],
            settings: { snoozeUntil: null, ignoredUsers: [], ignoredChannels: [] },
            stats: {}
        };
    }
    return userData.users[userId];
}

function getMatchRegex(keyword, mode) {
    switch (mode) {
        case 'loose': return new RegExp(keyword, 'i');
        case 'exact': return new RegExp(`\\b${keyword}\\b`);
        case 'strict':
        default: return new RegExp(`\\b${keyword}\\b`, 'i');
    }
}

async function checkAIRelevance(messageContent, userContext) {
    const prompt = `You are a filter agent for a keyword notification bot. 
    A user is tracking a keyword and has specified this filtering context: "${userContext}"
    
    Message content: "${messageContent}"
    
    Based on the context, is this message relevant and worth notifying the user? 
    Answer ONLY with "YES" or "NO".`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();
        return text.includes("YES");
    } catch (error) {
        console.error("AI check error:", error);
        return true; 
    }
}

// --- INTERACTION HANDLING ---
client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const { commandName, options, user } = interaction;
        if (commandName === 'keywords' || commandName === 'keyword') {
            const focusedOption = options.getFocused(true);
            if (focusedOption.name === 'keyword') {
                const u = getUser(user.id);
                const choices = u.keywords.map(k => k.keyword);
                const filtered = choices.filter(choice => choice.startsWith(focusedOption.value.toLowerCase())).slice(0, 25);
                await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user } = interaction;
    const userId = user.id;
    const u = getUser(userId);

    if (commandName === 'keywords' || commandName === 'keyword') {
        const sub = options.getSubcommand();
        if (sub === 'add') {
            const kw = options.getString('keyword').toLowerCase();
            const ch = options.getChannel('channel');
            const chId = options.getString('channel_id') || ch?.id || null;
            const aiContext = options.getString('ai_context');
            const mode = options.getString('mode') || 'strict';
            const cooldown = options.getInteger('cooldown') || 0;

            if (u.keywords.some(k => k.keyword === kw && k.channelId === chId)) {
                return interaction.reply({ content: 'Keyword already exists with those settings.', ephemeral: true });
            }

            u.keywords.push({ keyword: kw, channelId: chId, aiContext, mode, cooldown, lastTriggered: 0 });
            saveData();
            await interaction.reply({ content: `Added **${kw}** (${mode})${chId ? ` in <#${chId}>` : ''}${aiContext ? ` with AI Filter: "${aiContext}"` : ''}.`, ephemeral: true });
        } 
        else if (sub === 'remove') {
            const kw = options.getString('keyword').toLowerCase();
            const ch = options.getChannel('channel');
            const chId = options.getString('channel_id') || ch?.id || null;
            const startLen = u.keywords.length;
            u.keywords = u.keywords.filter(k => !(k.keyword === kw && k.channelId === chId));
            if (u.keywords.length < startLen) {
                saveData();
                await interaction.reply({ content: `Removed **${kw}**.`, ephemeral: true });
            } else {
                await interaction.reply({ content: 'Keyword not found.', ephemeral: true });
            }
        }
        else if (sub === 'list') {
            if (!u.keywords.length) return interaction.reply({ content: 'No keywords tracked.', ephemeral: true });
            const list = u.keywords.map(k => `- **${k.keyword}** [${k.mode}]${k.channelId ? ` in <#${k.channelId}>` : ''}${k.aiContext ? ` (AI Filter: ${k.aiContext})` : ''}`).join('\n');
            const embed = new EmbedBuilder().setTitle('Your Keywords').setDescription(list).setColor(0x5865F2);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    else if (commandName === 'settings') {
        const sub = options.getSubcommand();
        if (sub === 'snooze') {
            const mins = options.getInteger('minutes');
            u.settings.snoozeUntil = Date.now() + (mins * 60000);
            saveData();
            await interaction.reply({ content: `Snoozed for ${mins} minutes.`, ephemeral: true });
        }
        else if (sub === 'ignore_user') {
            const target = options.getUser('user');
            if (!u.settings.ignoredUsers.includes(target.id)) {
                u.settings.ignoredUsers.push(target.id);
                saveData();
            }
            await interaction.reply({ content: `Ignoring <@${target.id}>.`, ephemeral: true });
        }
        else if (sub === 'ignore_channel') {
            const ch = options.getChannel('channel');
            const chId = options.getString('channel_id') || ch?.id;
            
            if (!chId) return interaction.reply({ content: 'Please select a channel or provide a channel ID.', ephemeral: true });

            if (!u.settings.ignoredChannels.includes(chId)) {
                u.settings.ignoredChannels.push(chId);
                saveData();
            }
            await interaction.reply({ content: `Ignoring <#${chId}>.`, ephemeral: true });
        }
        else if (sub === 'view') {
            const snoozed = u.settings.snoozeUntil && u.settings.snoozeUntil > Date.now();
            const snoozeText = snoozed ? `Active until <t:${Math.floor(u.settings.snoozeUntil / 1000)}:R>` : 'Inactive';
            const users = u.settings.ignoredUsers.length ? u.settings.ignoredUsers.map(id => `<@${id}>`).join(', ') : 'None';
            const channels = u.settings.ignoredChannels.length ? u.settings.ignoredChannels.map(id => `<#${id}>`).join(', ') : 'None';
            
            const embed = new EmbedBuilder()
                .setTitle('Your Settings')
                .addFields(
                    { name: 'Snooze', value: snoozeText },
                    { name: 'Ignored Users', value: users },
                    { name: 'Ignored Channels', value: channels }
                ).setColor(0x5865F2);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    else if (commandName === 'stats') {
        const statsArray = Object.entries(u.stats).sort((a, b) => b[1].triggers - a[1].triggers);
        if (!statsArray.length) return interaction.reply({ content: 'No stats available yet.', ephemeral: true });
        const desc = statsArray.map(([kw, data]) => `**${kw}**: ${data.triggers} triggers`).join('\n');
        const embed = new EmbedBuilder().setTitle('Highlight Stats').setDescription(desc).setColor(0x5865F2);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'status') {
        const uptime = Math.floor(process.uptime());
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        const memoryUsage = process.memoryUsage().rss / 1024 / 1024;
        const totalUsers = Object.keys(userData.users).length;
        const totalKeywords = Object.values(userData.users).reduce((acc, curr) => acc + curr.keywords.length, 0);

        const embed = new EmbedBuilder()
            .setTitle('Bot Status')
            .addFields(
                { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: 'Memory', value: `${memoryUsage.toFixed(2)} MB`, inline: true },
                { name: 'Latency', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Usage', value: `${totalUsers} users tracking ${totalKeywords} keywords` }
            )
            .setColor(0x00FF00)
            .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('Highlight Bot Help Guide')
            .setDescription('A feature-rich keyword notification bot with AI filtering.')
            .addFields(
                { name: '📍 Keyword Management', value: '`/keywords add <word>`: Track a word. Options:\n- `channel`: Limit to one channel.\n- `ai_context`: Describe what you want (e.g. "real news only").\n- `mode`: Strict, Loose, or Exact.\n- `cooldown`: Minutes between pings.' },
                { name: '⚙️ Settings & Privacy', value: '`/settings snooze <mins>`: Silence all pings.\n`/settings ignore_user`: Stop pings from a specific user.\n`/settings ignore_channel`: Mute a channel.' },
                { name: '💡 Smart Features', value: '**Context**: Alerts show the previous 3 messages.\n**Activity Detection**: Bot skips DMs if you are currently active in that channel.' },
                { name: '📊 Statistics', value: '`/stats`: View which of your keywords trigger most often.' },
                { name: '🔧 Health', value: '`/status`: Check uptime and latency.' }
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'V1.2.0 • Created with Gemini AI' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// --- MESSAGE TRIGGER LOGIC ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const authorId = message.author.id;
    const channelId = message.channel.id;
    recentMessages.set(authorId, { channelId, timestamp: Date.now() });

    for (const [trackedUserId, data] of Object.entries(userData.users)) {
        if (trackedUserId === authorId) continue;
        if (data.settings.snoozeUntil && data.settings.snoozeUntil > Date.now()) continue;
        if (data.settings.ignoredUsers.includes(authorId)) continue;
        if (data.settings.ignoredChannels.includes(channelId)) continue;

        const lastMsg = recentMessages.get(trackedUserId);
        const lastType = recentTypers.get(trackedUserId);
        const activeMsg = lastMsg && lastMsg.channelId === channelId && (Date.now() - lastMsg.timestamp < 60000);
        const activeType = lastType && lastType.channelId === channelId && (Date.now() - lastType.timestamp < 60000);
        if (activeMsg || activeType) continue;

        const triggerKw = data.keywords.find(k => {
            if (k.channelId && k.channelId !== channelId) return false;
            if (k.cooldown && k.lastTriggered && (Date.now() - k.lastTriggered < k.cooldown * 60000)) return false;
            return getMatchRegex(k.keyword, k.mode).test(message.content);
        });

        if (!triggerKw) continue;

        if (triggerKw.aiContext) {
            const isRelevant = await checkAIRelevance(message.content, triggerKw.aiContext);
            if (!isRelevant) continue;
        }

        const guildMember = await message.guild.members.fetch(trackedUserId).catch(() => null);
        if (!guildMember) continue;
        const perms = message.channel.permissionsFor(guildMember);
        if (!perms || !perms.has(PermissionsBitField.Flags.ViewChannel)) continue;

        triggerKw.lastTriggered = Date.now();
        if (!data.stats[triggerKw.keyword]) data.stats[triggerKw.keyword] = { triggers: 0, lastTriggered: 0 };
        data.stats[triggerKw.keyword].triggers++;
        data.stats[triggerKw.keyword].lastTriggered = Date.now();
        saveData();

        try {
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const messages = await message.channel.messages.fetch({ limit: 3, before: message.id });
            const context = messages.reverse().map(m => `**${m.author.username}**: ${m.content.substring(0, 100)}`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: `In ${message.guild.name} • #${message.channel.name}`, iconURL: message.guild.iconURL() || '' })
                .setDescription(`Highlight: **${triggerKw.keyword}**${triggerKw.aiContext ? ' (AI Filtered)' : ''}`)
                .addFields(
                    { name: 'Context', value: context || '*No previous messages found*' },
                    { name: `${message.author.tag}`, value: message.content || '*No content*' },
                    { name: 'Jump', value: `[Click to jump](${messageLink})` }
                ).setTimestamp();

            const userObj = await client.users.fetch(trackedUserId);
            await userObj.send({ embeds: [embed] });
        } catch (error) { console.error(`Failed to DM ${trackedUserId}: ${error}`); }
    }
});

client.on('typingStart', (event) => {
    if (!event.channel || !event.user) return;
    recentTypers.set(event.user.id, { channelId: event.channel.id, timestamp: Date.now() });
});

client.login(process.env.TOKEN)
    .then(() => console.log("Bot online."))
    .catch(err => console.error("Login failed:", err));
