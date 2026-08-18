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

// Helper: သက်ဆိုင်ရာ Comment / Thread ၏ မူရင်း Post ID ကို တိကျစွာ ရယူခြင်း
const getPostId = (ctx) => {
  if (ctx.message?.message_thread_id) {
    return String(ctx.message.message_thread_id);
  }
  if (ctx.message?.reply_to_message) {
    return String(ctx.message.reply_to_message.message_id);
  }
  return String(ctx.chat.id);
};

// Slot Machine ရလဒ် တွက်ချက်ခြင်း
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

// Global Error Handler
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Delay ဖြင့် Message ဖျက်ပေးမည့် Helper Function (Default 5s)
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e.message);
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Direct Deletion Helper (သတိပေးစာ ၁၀ စက္ကန့်အကြာတွင် ဖျက်ရန်)
const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete failed:`, e.message);
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

// 3. Admin Broadcast Command (ID: 1793453606)
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== 1793453606) return ctx.reply('❌ Restricted.');

  const customMessage = ctx.match;
  if (!customMessage) return ctx.reply('⚠️ /broadcast <your_message>');

  try {
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) return ctx.reply('❌ User မရှိပါ။');

    const statusMsg = await ctx.reply(`🚀 User ${users.length} ဦးထံ ပို့နေပါပြီ...`);
    let successCount = 0, failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, { parse_mode: 'HTML' });
        successCount++;
        await sleep(50); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast ပြီးပါပြီ!</b>\n\n📤 အောင်မြင် - ${successCount}\n❌ မရောက်ပါ - ${failCount}`, 
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error("Broadcast Error:", err);
  }
});

// ==========================================
// 4. Photo Proof Handling (သီးသန့် Comment Thread အတွက် စစ်ဆေးမှတ်သားခြင်း)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return; // Channel Comment မဟုတ်ပါက ကျော်မည်

  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  try {
    // 1. User Info ကို DB ထဲ ရေးသွင်းမည်
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername
    }, { onConflict: 'telegram_id' });

    // 2. Proof Table တွင် User + Post ID တွဲလျက် Access ပေးထားကြောင်း မှတ်သားမည်
    const { error } = await supabase.from('user_proofs').upsert({
      user_id: userId,
      post_id: postId,
      has_photo_proof: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,post_id' });

    if (error) {
      console.error("Supabase Proof Insert Error:", error);
      return;
    }

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    if (ctx.message.message_thread_id) {
      replyOptions.message_thread_id = ctx.message.message_thread_id;
    }

    // သက်ဆိုင်ရာ Comment တွင်သာ Access ရကြောင်း စာပြန်မည်
    const sentMsg = await ctx.reply(
      `📸 <b>Reaction Screenshot Recorded!</b>\n\n` +
      `ကျေးဇူးတင်ပါတယ် ${displayName}! ဒီ Post အတွက် Reaction Proof ကို လက်ခံရရှိပါပြီ။\n\n` +
      `🎰 <b>ယခု Spin (Slot) လှည့်နိုင်ပါပြီ!</b>`, 
      replyOptions
    );

    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
  } catch (err) {
    console.error("Photo Handler Error:", err);
  }
});

// ==========================================
// 5. Dice Handling & Strict Proof Verification Check
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

  // --------------------------------------------------
  // ၁။ DB ထဲတွင် ဒီ User သည် အဆိုပါ Post အတွက် ပုံ ပို့ထားပြီးပြီလား စစ်မည်
  // --------------------------------------------------
  let isVerified = false;

  try {
    const { data: proofData } = await supabase
      .from('user_proofs')
      .select('has_photo_proof')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (proofData && proofData.has_photo_proof === true) {
      isVerified = true;
    }
  } catch (err) {
    console.error("Proof Check Error:", err);
  }

  // --------------------------------------------------
  // A. ပုံ မပို့ရသေးပါက (Dice ဖျက်မည် + သက်ဆိုင်ရာ Comment ထဲတွင် Warning ပို့မည်)
  // --------------------------------------------------
  if (!isVerified) {
    // Dice ကို ချက်ချင်း ဖျက်မည်
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Dice delete failed:", e.message);
    }

    // သက်ဆိုင်ရာ Post လင့်ခ် တည်ဆောက်ခြင်း
    const threadId = ctx.message.message_thread_id;
    const replyMsg = ctx.message.reply_to_message;
    const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
    let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
    
    let postLink = channelUsername 
      ? `https://t.me/${channelUsername}/${finalPostId}`
      : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

    const warningOptions = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (threadId) {
      warningOptions.message_thread_id = threadId;
    }

    // သက်ဆိုင်ရာ Comment Thread ထဲတွင်သာ သတိပေးစာ ထွက်မည်
    const warningMsg = await ctx.reply(
      `⚠️ <b>Spin လှည့်ခွင့် မရှိသေးပါ!</b>\n\n` +
      `${displayName} မင်္ဂလာပါ၊ Spin (🎰) မလှည့်မီ သက်ဆိုင်ရာ Post ကို ❤️/👍 Reaction ပေးထားကြောင်း <b>Screenshot ပုံကို ဒီ Comment Thread ထဲသို့ အရင် ပို့ပေးပါ!</b>\n\n` +
      `👉 <a href="${postLink}">ဒီနေရာကိုနှိပ်၍ မူရင်း Post သို့သွားပါ</a>`,
      warningOptions
    );

    // ၁၀ စက္ကန့်ပြည့်လျှင် သတိပေးစာကို Auto ဖျက်မည်
    deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
    return;
  }

  // --------------------------------------------------
  // B. ပုံ ပို့ထားပြီးပါက (Proof Reset ပြန်လုပ်မည် + Spin ရလဒ်ပေးမည်)
  // --------------------------------------------------
  // လှည့်ပြီးပါက DB ထဲမှ Proof Access ကို Reset ပြန်လုပ်မည် (ထပ်လှည့်ချင်ပါက ပုံအသစ် ပြန်ပို့ရမည်)
  try {
    await supabase
      .from('user_proofs')
      .update({ has_photo_proof: false })
      .eq('user_id', userId)
      .eq('post_id', postId);
  } catch (err) {
    console.error("Reset proof error:", err);
  }

  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    // Current Balance ရယူခြင်း
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

    // Balance ကို DB တွင် Update/Insert လုပ်ခြင်း
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
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
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
