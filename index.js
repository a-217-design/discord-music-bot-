const {
  Client,
  GatewayIntentBits,
  ActivityType
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior
} = require("@discordjs/voice");

const play = require("play-dl");

const PREFIX = "1";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const queues = new Map();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "1p | Music",
        type: ActivityType.Listening
      }
    ],
    status: "online"
  });
});

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      }
    });

    queues.set(guildId, {
      songs: [],
      player,
      connection: null
    });
  }

  return queues.get(guildId);
}

async function playNext(guildId, channel) {
  const queue = queues.get(guildId);

  if (!queue || queue.songs.length === 0) {
    return;
  }

  const song = queue.songs[0];

  try {
    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    queue.player.play(resource);

    channel.send(`🎵 الآن يتم تشغيل: **${song.title}**`);
  } catch (error) {
    console.error(error);

    queue.songs.shift();

    channel.send("❌ ما كدرت أشغل هاي الأغنية، أجرب اللي بعدها.");

    playNext(guildId, channel);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  const queue = getQueue(message.guild.id);

  if (command === "p" || command === "play") {
    const query = args.join(" ");

    if (!query) {
      return message.reply("❌ اكتب اسم الأغنية أو رابطها.");
    }

    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
      return message.reply("❌ لازم تدخل روم صوتي أولاً.");
    }

    try {
      if (!queue.connection) {
        queue.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: false
        });

        queue.connection.subscribe(queue.player);
      }

      let url = query;
      let title = query;

      if (!query.startsWith("http://") && !query.startsWith("https://")) {
        const results = await play.search(query, {
          limit: 1,
          source: {
            youtube: "video"
          }
        });

        if (!results.length) {
          return message.reply("❌ ما لكيت هاي الأغنية.");
        }

        url = results[0].url;
        title = results[0].title;
      } else {
        try {
          const info = await play.video_basic_info(query);
          title = info.video_details.title;
        } catch {
          title = query;
        }
      }

      queue.songs.push({
        url,
        title,
        requestedBy: message.author.id
      });

      if (
        queue.player.state.status !== AudioPlayerStatus.Playing &&
        queue.player.state.status !== AudioPlayerStatus.Buffering
      ) {
        await playNext(message.guild.id, message.channel);
      } else {
        message.channel.send(`✅ انضافت للقائمة: **${title}**`);
      }
    } catch (error) {
      console.error(error);
      message.reply("❌ صار خطأ أثناء تشغيل الأغنية.");
    }
  }

  if (command === "skip") {
    if (!queue.songs.length) {
      return message.reply("❌ ماكو أغنية حالياً.");
    }

    queue.songs.shift();
    queue.player.stop();

    message.channel.send("⏭️ تم تخطي الأغنية.");

    if (queue.songs.length
