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

// Helper: သက်ဆိုင်ရာ Post ID / Thread ID ရယူခြင်း
const getPostId = (ctx) => {
  if (ctx.message?.message_thread_id) {
    return ctx.message.message_thread_id;
  }
  if (ctx.message?.reply_to_message) {
    return ctx.message.reply_to_message.message_thread_id || ctx.message.reply_to_message.message_id;
  }
  return ctx.chat.id;
};

// Telegram Slot Machine ၏ 777 အပါအဝင် တရားဝင် ရလဒ်များအားလုံး တိကျစွာ တွက်ချက်သည့် Function
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

// Delay ဖြင့် Background မှာ Message ဖျက်ပေးမည့် Helper Function (Default 5s)
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Direct Message Deletion Helper (Warning Message များ 10s ကြာလျှင် ဖျက်ရန်)
const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete message failed for ${messageId}:`, e.message);
  }
};

// 1. /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// 3. Admin Broadcast Command
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
// 4. Photo Proof Verification Handler (Post သီးသန့် စစ်ဆေးခြင်း)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  const threadId = ctx.message.message_thread_id;

  try {
    // သက်ဆိုင်ရာ Post ID နှင့် User ID တွဲဖက်၍ DB တွင် Verified ဟု မှတ်သားမည်
    await supabase.from('user_proofs').upsert({
      user_id: userId,
      post_id: String(postId),
      has_photo_proof: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,post_id' });

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    if (threadId) replyOptions.message_thread_id = threadId;

    // အတည်ပြုကြောင်းနှင့် Spin လှည့်နိုင်ပြီဖြစ်ကြောင်း စာပြန်မည်
    const sentMsg = await ctx.reply(
      `❤️ <b>Heart Reaction Screenshot Received!</b>\n\n` +
      `Thank you ${displayName}! Your reaction proof for this post is verified. Access Granted! You can now send 🎰 to spin!`, 
      replyOptions
    );

    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
  } catch (err) {
    console.error("Photo Proof Verification Error:", err);
  }
});

// ==========================================
// 5. Slot Machine Dice Handling & Proof Verification Check
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const threadId = ctx.message.message_thread_id;
  const replyMsg = ctx.message.reply_to_message;

  // ----------------------------------------------------
  // ၁။ သက်ဆိုင်ရာ POST ID အောက်တွင် ပုံ ပို့ထားခြင်း ရှိမရှိ စစ်ဆေးခြင်း
  // ----------------------------------------------------
  let isVerified = false;

  try {
    const { data: proofData } = await supabase
      .from('user_proofs')
      .select('has_photo_proof')
      .eq('user_id', userId)
      .eq('post_id', String(postId))
      .eq('has_photo_proof', true)
      .maybeSingle();

    if (proofData && proofData.has_photo_proof) {
      isVerified = true;
    }
  } catch (err) {
    console.error("Proof DB Check Error:", err);
  }

  // ----------------------------------------------------
  // A. ပုံမပို့ရသေးပါက (Access Denied စာထုတ်မည် + ၁၀ စက္ကန့်အကြာတွင် ဖျက်မည်)
  // ----------------------------------------------------
  if (!isVerified) {
    // Dice ကို ချက်ချင်း ဖျက်မည်
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Error deleting dice:", e.message);
    }

    // သက်ဆိုင်ရာ Post Link တည်ဆောက်ခြင်း
    const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
    let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
    let postLink = channelUsername 
      ? `https://t.me/${channelUsername}/${finalPostId}`
      : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

    const warningOptions = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (threadId) warningOptions.message_thread_id = threadId;
    if (replyMsg) warningOptions.reply_to_message_id = replyMsg.message_id;

    // သတိပေးစာ ပို့မည်
    const warningMsg = await ctx.reply(
      `⚠️ <b>Access Denied!</b>\n\n` +
      `Hey ${displayName}, you must react (❤️ or 👍) to the post and reply with a <b>Screenshot Photo</b> in this exact comment thread before spinning!\n\n` +
      `👉 <a href="${postLink}">Click Here to View Post & React</a>`,
      warningOptions
    );

    // ၁၀ စက္ကန့်အကြာတွင် သတိပေးစာကို Auto ဖျက်မည်
    deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
    return;
  }

  // ----------------------------------------------------
  // B. ပုံ ပို့ထားပြီး မှန်ကန်ပါက (Spin & Reward တွက်ချက်မည်)
  // ----------------------------------------------------
  // လှည့်ပြီးပါက အဆိုပါ Post အတွက် Verification Status ကို Reset ပြန်လုပ်မည်
  try {
    await supabase.from('user_proofs').update({ has_photo_proof: false }).eq('user_id', userId).eq('post_id', String(postId));
  } catch (err) {
    console.error("Reset proof error:", err);
  }

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

// Vercel Serverless Native Handler
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
