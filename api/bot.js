const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Delay/Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine ရလဒ်နှင့် ဆုကြေးများ တွက်ချက်သည့် Function
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00080 },
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },
    2: { name: '🍋 🍋 🍋',       reward: 0.00030 },
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.00100 }
  };

  if (r1 === r2 && r2 === r3) {
    return symbols[r3] || null;
  }

  return null;
};

// Delay ပြုလုပ်ပြီး စာဖျက်ပေးမည့် Function
const deleteMessageAfterDelay = async (ctx, chatId, messageId, delayMs = 5000) => {
  await sleep(delayMs);
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch (err) {
    console.error(`Failed to delete message ${messageId}:`, err.message);
  }
};

// Error Catching
bot.catch((err) => {
  console.error('Error in bot execution:', err);
});

// ==========================================
// 1. Reaction Event Handling
// User Post/Message အား Reaction ပေးခြင်း/ဖြုတ်ခြင်းကို DB တွင် သိမ်းမည်
// ==========================================
bot.on('message_reaction', async (ctx) => {
  try {
    const reaction = ctx.messageReaction;
    if (!reaction) return;

    const messageId = reaction.message_id;
    const userId = reaction.user?.id || reaction.actor_chat?.id;
    const newReactions = reaction.new_reaction || [];

    if (!userId) return;

    // Reaction ရှိပါက DB တွင် status: true သို့မဟုတ် Record ထည့်မည်
    if (newReactions.length > 0) {
      await supabase.from('reactions').upsert({
        message_id: messageId,
        telegram_id: userId,
        has_reacted: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'message_id,telegram_id' });
    } else {
      // Reaction ဖြုတ်လိုက်ပါက DB မှ Status ပြောင်းမည် သို့မဟုတ် ဖျက်မည်
      await supabase.from('reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('telegram_id', userId);
    }
  } catch (err) {
    console.error("Reaction Update Error:", err);
  }
});

// /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.000000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  await deleteMessageAfterDelay(ctx, ctx.chat.id, sent.message_id, 5000);
});

// /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// ==========================================
// 2. Dice (Slot Machine) Event Handling
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const replyMsg = ctx.message.reply_to_message;
  const threadId = ctx.message.message_thread_id;

  // စစ်ဆေးရမည့် Target Message IDs များကို စုဆောင်းခြင်း
  let possibleMsgIds = [];
  let channelUsername = null;
  let channelChatId = null;

  if (threadId) possibleMsgIds.push(threadId);

  if (replyMsg) {
    possibleMsgIds.push(replyMsg.message_id);
    if (replyMsg.forward_from_message_id) possibleMsgIds.push(replyMsg.forward_from_message_id);
    if (replyMsg.forward_from_chat) {
      channelUsername = replyMsg.forward_from_chat.username;
      channelChatId = replyMsg.forward_from_chat.id;
    }
    if (replyMsg.external_reply?.message_id) {
      possibleMsgIds.push(replyMsg.external_reply.message_id);
      if (replyMsg.external_reply.chat) {
        channelUsername = replyMsg.external_reply.chat.username;
        channelChatId = replyMsg.external_reply.chat.id;
      }
    }
  }

  // Database တွင် Reaction ပေးထားခြင်း ရှိ/မရှိ စစ်ဆေးခြင်း
  let hasReacted = false;
  if (possibleMsgIds.length > 0) {
    try {
      const { data: reactionData } = await supabase
        .from('reactions')
        .select('id')
        .in('message_id', possibleMsgIds)
        .eq('telegram_id', userId);

      if (reactionData && reactionData.length > 0) {
        hasReacted = true;
      }
    } catch (reactErr) {
      console.error("Reaction Query Error:", reactErr);
    }
  }

  // ------------------------------------------
  // A. Reaction မရှိလျှင် (သို့မဟုတ် Reaction ဖြုတ်ထားလျှင်)
  // ------------------------------------------
  if (!hasReacted) {
    // 1. ရိုက်လိုက်သော Dice Message အား ချက်ချင်းဖျက်မည်
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Failed to delete user dice:", e);
    }

    // 2. Original Post Link တည်ဆောက်ခြင်း
    const targetMsgId = possibleMsgIds[possibleMsgIds.length - 1] || ctx.message.message_id;
    let postLink = '';
    if (channelUsername) {
      postLink = `https://t.me/${channelUsername}/${targetMsgId}`;
    } else if (channelChatId) {
      const cleanChatId = channelChatId.toString().replace('-100', '');
      postLink = `https://t.me/c/${cleanChatId}/${targetMsgId}`;
    } else if (ctx.chat.username) {
      postLink = `https://t.me/${ctx.chat.username}/${targetMsgId}`;
    } else {
      const cleanChatId = ctx.chat.id.toString().replace('-100', '');
      postLink = `https://t.me/c/${cleanChatId}/${targetMsgId}`;
    }

    const warningOptions = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (threadId) warningOptions.message_thread_id = threadId;

    // 3. သတိပေးစာ ပို့မည်
    const warningMsg = await ctx.reply(
      `🚫 <b>Access Denied!</b>\n\n` +
      `Hey ${displayName}, you must react (❤️/👍) to the original post before you can spin!\n\n` +
      `👉 <a href="${postLink}">Click here to React to the Post</a>`,
      warningOptions
    );

    // 4. သတိပေးစာကို ၅ စက္ကန့်အကြာတွင် ဖျက်မည်
    await deleteMessageAfterDelay(ctx, ctx.chat.id, warningMsg.message_id, 5000);
    return;
  }

  // ------------------------------------------
  // B. Reaction ရှိလျှင် (Spin တက်မည် / Balance ပေါင်းမည်)
  // ------------------------------------------
  const diceValue = ctx.message.dice.value;
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  let newBalance = 0;

  try {
    // DB မှ လက်ရှိ Balance ရယူခြင်း
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    const currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    
    // Exact Precision Balance တွက်ချက်မှု (၆ နေရာအထိ တိကျစေရန်)
    newBalance = parseFloat((currentBalance + reward).toFixed(6));

    // Balance အသစ်ကို DB တွင် Update လုပ်ခြင်း
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance,
      updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });

  } catch (dbErr) {
    console.error("Supabase Balance Update Error:", dbErr);
  }

  // Reply Message တည်ဆောက်ခြင်း
  let replyText = '';
  if (winCombination) {
    replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
      `<b>You got ${winCombination.name} and received ${reward.toFixed(5)} GRAM!</b>\n` +
      `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
  } else {
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_parameters: { message_id: ctx.message.message_id }
  };
  if (threadId) replyOptions.message_thread_id = threadId;

  // ရလဒ်စာ ပို့မည်
  const resultMsg = await ctx.reply(replyText, replyOptions);

  // ရလဒ်စာကို ၅ စက္ကန့်အကြာတွင် ဖျက်မည်
  await deleteMessageAfterDelay(ctx, ctx.chat.id, resultMsg.message_id, 5000);
});

// ==========================================
// 3. Vercel Serverless Webhook Handler
// ==========================================
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res, context) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      
      // Vercel Environment တွင် Async Task များ ပြီးဆုံးသည်အထိ စောင့်ဆိုင်းပေးရန် waitUntil ထည့်သွင်းထားသည်
      const waitUntil = context && typeof context.waitUntil === 'function' 
        ? context.waitUntil.bind(context) 
        : (promise) => promise;

      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        }),
        waitUntil
      );

      res.status(response.status);
      const text = await response.text();
      return res.send(text);
    } catch (err) {
      console.error("Webhook Execution Error:", err);
      return res.status(200).send('OK');
    }
  }

  return res.status(200).send('Bot Status: Active and Running!');
};
