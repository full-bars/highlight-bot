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
    const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!rawData.users) {
        // Migration handled in previous version
        userData = { users: {} };
    } else {
        userData = rawData;
    }
}

const saveData = () => fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));

// Track recent activity
const recentMessages = new Map();
const recentTypers = new Map();

// --- SLASH COMMANDS DEFINITION ---
const commands = [
    new SlashCommandBuilder()
        .setName('keywords')
        .setDescription('Manage your keywords')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a keyword')
            .addStringOption(opt => opt.setName('keyword').setDescription('Keyword to track').setRequired(true))
            .addChannelOption(opt => opt.setName('channel').setDescription('Specific channel only').addChannelTypes(ChannelType.GuildText))
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
            .addStringOption(opt => opt.setName('keyword').setDescription('Keyword to remove').setRequired(true))
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel setting it was saved with')))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List your keywords')),

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
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel to ignore').setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('View your ignore lists and snooze status')),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your highlight statistics')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash commands registered.');
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
        return true; // Notify by default if AI fails
    }
}

// --- INTERACTION HANDLING ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user } = interaction;
    const userId = user.id;
    const u = getUser(userId);

    if (commandName === 'keywords') {
        const sub = options.getSubcommand();
        if (sub === 'add') {
            const kw = options.getString('keyword').toLowerCase();
            const ch = options.getChannel('channel');
            const aiContext = options.getString('ai_context');
            const mode = options.getString('mode') || 'strict';
            const cooldown = options.getInteger('cooldown') || 0;

            if (u.keywords.some(k => k.keyword === kw && k.channelId === (ch?.id || null))) {
                return interaction.reply({ content: 'Keyword already exists with those settings.', ephemeral: true });
            }

            u.keywords.push({ keyword: kw, channelId: ch?.id || null, aiContext, mode, cooldown, lastTriggered: 0 });
            saveData();
            await interaction.reply({ content: `Added **${kw}** (${mode})${ch ? ` in <#${ch.id}>` : ''}${aiContext ? ` with AI Filter: "${aiContext}"` : ''}.`, ephemeral: true });
        } 
        else if (sub === 'remove') {
            const kw = options.getString('keyword').toLowerCase();
            const ch = options.getChannel('channel');
            const startLen = u.keywords.length;
            u.keywords = u.keywords.filter(k => !(k.keyword === kw && k.channelId === (ch?.id || null)));
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

    if (commandName === 'settings') {
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
            const target = options.getChannel('channel');
            if (!u.settings.ignoredChannels.includes(target.id)) {
                u.settings.ignoredChannels.push(target.id);
                saveData();
            }
            await interaction.reply({ content: `Ignoring <#${target.id}>.`, ephemeral: true });
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

    if (commandName === 'stats') {
        const statsArray = Object.entries(u.stats).sort((a, b) => b[1].triggers - a[1].triggers);
        if (!statsArray.length) return interaction.reply({ content: 'No stats available yet.', ephemeral: true });
        const desc = statsArray.map(([kw, data]) => `**${kw}**: ${data.triggers} triggers`).join('\n');
        const embed = new EmbedBuilder().setTitle('Highlight Stats').setDescription(desc).setColor(0x5865F2);
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

        // --- AI FILTERING ---
        if (triggerKw.aiContext) {
            const isRelevant = await checkAIRelevance(message.content, triggerKw.aiContext);
            if (!isRelevant) continue;
        }

        const guildMember = await message.guild.members.fetch(trackedUserId).catch(() => null);
        if (!guildMember) continue;
        const perms = message.channel.permissionsFor(guildMember);
        if (!perms || !perms.has(PermissionsBitField.Flags.ViewChannel)) continue;

        // Update stats
        triggerKw.lastTriggered = Date.now();
        if (!data.stats[triggerKw.keyword]) data.stats[triggerKw.keyword] = { triggers: 0, lastTriggered: 0 };
        data.stats[triggerKw.keyword].triggers++;
        data.stats[triggerKw.keyword].lastTriggered = Date.now();
        saveData();

        // Send DM
        try {
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const messages = await message.channel.messages.fetch({ limit: 3, before: message.id });
            const context = messages.reverse().map(m => `**${m.author.username}**: ${m.content.substring(0, 100)}`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: `In ${message.guild.name} • #${message.channel.name}`, iconURL: message.guild.iconURL() || '' })
                .setDescription(`AI Highlight: **${triggerKw.keyword}**`)
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
    .then(() => console.log("Bot online with AI capabilities."))
    .catch(err => console.error("Login failed:", err));
