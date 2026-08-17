const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Telegram Slot Machine ၏ 777 အပါအဝင် တရားဝင် ရလဒ်များအားလုံး တိကျစွာ တွက်ချက်သည့် Function (မူရင်းအတိုင်း)
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00080 },
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },
    2: { name: '🍋 🍋 🍋',       reward: 0.00030 },
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.0010 }
  };

  if (r1 === r2 && r2 === r3) {
    return symbols[r3] || null;
  }

  return null;
};

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Vercel Serverless Safe Delete Message Helper (၅ စက္ကန့်အကြာတွင် သေချာဖျက်ပေးမည်)
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error(`Delete message failed (${messageId}):`, e.message);
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// 1. /start Command (မူရင်းအတိုင်း)
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 ```javascript
💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command (မူရင်းအတိုင်း)
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// ==========================================
// 3. Admin (1793453606) သီးသန့် Broadcast ပို့မည့် Command (မူရင်းအတိုင်း)
// ==========================================
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (userId !== 1793453606) {
    return ctx.reply('❌ This command is restricted.');
  }

  const customMessage = ctx.match;

  if (!customMessage) {
    return ctx.reply('⚠️ ကျေးဇူးပြု၍ ပို့လိုသော စာသားကို ထည့်ပါ။\n\n<b>ပုံစံ -</b> <code>/broadcast your_message_here</code>', { parse_mode: 'HTML' });
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id');

    if (error || !users || users.length === 0) {
      return ctx.reply('❌ Database မှ User စာရင်းများကို ဆွဲထုတ်၍ မရပါ (သို့) User မရှိပါ။');
    }

    const statusMsg = await ctx.reply(`🚀 User ${users.length} ဦးထံသို့ စတင်ပို့ဆောင်နေပါပြီ...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: false
        });
        successCount++;
        await sleep(50); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast ပြီးစီးပါပြီ!</b>\n\n📤 ပို့ဆောင်နိုင်သူ - ${successCount} ဦး\n❌ မပို့နိုင်သူ - ${failCount} ဦး`, 
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error("Broadcast Error:", err);
    await ctx.reply('❌ Broadcast လုပ်ရာတွင် အမှားအယွင်း ရှိနေပါသည်။');
  }
});

// ==========================================
// 4. Slot Machine Dice Handling
// Comment Thread တွင် အတိအကျ ပို့ဆောင်/ဖျက်ဆီးခြင်းနှင့် Reaction တိုက်ရိုက် စစ်ဆေးခြင်း
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const threadId = ctx.message.message_thread_id;
  const replyMsg = ctx.message.reply_to_message;

  // Reaction စစ်ဆေးရန် Main Post ID ရှာဖွေခြင်း
  let targetPostId = threadId || (replyMsg ? replyMsg.message_id : null);
  let channelUsername = null;
  let channelChatId = null;

  if (replyMsg) {
    if (replyMsg.forward_from_chat) {
      channelUsername = replyMsg.forward_from_chat.username;
      channelChatId = replyMsg.forward_from_chat.id;
    }
    if (replyMsg.external_reply?.chat) {
      channelUsername = replyMsg.external_reply.chat.username;
      channelChatId = replyMsg.external_reply.chat.id;
    }
  }

  // Telegram API မူရင်းမှ Reaction Data ကို Direct စစ်ဆေးခြင်း
  let hasReacted = false;

  try {
    const checkChatId = channelChatId || ctx.chat.id;
    if (targetPostId) {
      // Direct API Call ဖြင့် Telegram မှ Reaction Data ဆွဲယူခြင်း
      const reactions = await ctx.api.raw.getMessageReactions({
        chat_id: checkChatId,
        message_id: targetPostId
      });

      if (reactions && Array.isArray(reactions)) {
        hasReacted = reactions.some(r => r.user?.id === userId || r.actor_chat?.id === userId);
      }
    }
  } catch (reactErr) {
    // Bot ကို Admin Power မပေးထားပါက သို့မဟုတ် API Fail လျှင် Spin လှည့်ခွင့် မပိတ်ဘဲ ရအောင် လုပ်ပေးထားသည်
    console.warn("Reaction API fetch warning:", reactErr.message);
    hasReacted = true; 
  }

  // ------------------------------------------
  // A. Reaction မပေးထားပါက Spin ဖျက်မည်၊ Warning စာ တိကျစွာ ပို့မည်၊ ၅ စက္ကန့်အကြာ Auto ပျက်မည်
  // ------------------------------------------
  if (!hasReacted) {
    // 1. User ရိုက်လိုက်သည့် Spin Dice ကို ချက်ချင်း ဖျက်မည်
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Dice deletion error:", e.message);
    }

    // 2. Post Link ပြင်ဆင်ခြင်း
    const finalPostId = targetPostId || ctx.message.message_id;
    let postLink = '';
    if (channelUsername) {
      postLink = `[https://t.me/$](https://t.me/$){channelUsername}/${finalPostId}`;
    } else if (channelChatId) {
      const cleanChatId = channelChatId.toString().replace('-100', '');
      postLink = `[https://t.me/c/$](https://t.me/c/$){cleanChatId}/${finalPostId}`;
    } else if (ctx.chat.username) {
      postLink = `[https://t.me/$](https://t.me/$){ctx.chat.username}/${finalPostId}`;
    } else {
      const cleanChatId = ctx.chat.id.toString().replace('-100', '');
      postLink = `[https://t.me/c/$](https://t.me/c/$){cleanChatId}/${finalPostId}`;
    }

    // 3. Thread / Comment သီးသန့် Options ပြင်ဆင်ခြင်း
    const warningOptions = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (threadId) {
      warningOptions.message_thread_id = threadId;
    }

    // 4. Access Denied သတိပေးစာကို သက်ဆိုင်ရာ Comment ထဲသို့သာ ပို့မည်
    const warningMsg = await ctx.reply(
      `🚫 <b>Access Denied!</b>\n\n` +
      `Hey ${displayName}, you must react (❤️/👍) to the original post before you can spin!\n\n` +
      `👉 <a href="${postLink}">Click here to React to the Post</a>`,
      warningOptions
    );

    // 5. သတိပေးစာကို ၅ စက္ကန့်အကြာတွင် ဖျက်မည် (Vercel Safe Method)
    deleteMessageLater(ctx, ctx.chat.id, warningMsg.message_id, 5000);
    return;
  }

  // ------------------------------------------
  // B. Reaction ရှိပါက Normal Spin ပေါင်းမည် (မူရင်းအတိုင်း)
  // ------------------------------------------
  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .maybeSingle();
      let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${currentBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
    } catch (e) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,@REFERWORLD1📢</b>`;
    }
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (threadId) {
    replyOptions.message_thread_id = threadId;
  }

  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
});

// Vercel Serverless Native Handler (မူရင်းအတိုင်း)
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res, context) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      
      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        }),
        context && context.waitUntil ? context.waitUntil.bind(context) : undefined
      );

      res.status(response.status);
      const text = await response.text();
      return res.send(text);
    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(200).send('OK');
    }
  }

  return res.status(200).send('Status: Active!');
};
