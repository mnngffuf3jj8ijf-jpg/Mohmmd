const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const readline = require("readline");

// واجهة لإدخال رقم الهاتف من الكونسول عند الحاجة
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false, // معطل لأننا سنستخدم كود الاقتران
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // --- آلية الاقتران بالكود ---
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('⚠️ أدخل رقم الهاتف المرتبط بالواتساب (مثال: 9677xxxxxxxx):\n');
        const code = await sock.requestPairingCode(phoneNumber.replace(/[+ ]/g, ""));
        console.log(`\n🔥 كود الربط الخاص بك هو: ${code}\n`);
        console.log('افتح الواتساب > الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف وأدخل الكود أعلاه.');
    }

    sock.ev.on('creds.update', saveCreds);

    // --- نظام الترحيب بالأعضاء الجدد ---
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if (action === 'add') {
            for (let num of participants) {
                await sock.sendMessage(id, { 
                    text: `⚠️ نظام الحماية مفعل.\nمرحباً بك @${num.split('@')[0]}.\nالتزم بالقوانين لتجنب الطرد التلقائي.`, 
                    mentions: [num] 
                });
            }
        }
    });

    // --- محرك السيطرة، الحذف، والطرد ---
    sock.ev.on('messages.upsert', async (chat) => {
        const msg = chat.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const isGroup = from.endsWith('@g.us');

        // قائمة "الكلمات المحظورة" (أضف ما تشاء هنا)
        const blacklist = ["مسبات", "روابط", "كلمة_سيئة"];
        
        if (isGroup && blacklist.some(word => text.includes(word))) {
            try {
                // حذف الرسالة المنتهكة
                await sock.sendMessage(from, { delete: msg.key });
                // طرد العضو المنتهك (يجب أن يكون البوت مشرفاً)
                await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
                await sock.sendMessage(from, { text: "🛑 تم اكتشاف انتهاك.\nتم طرد العضو وتطهير المجموعة بنجاح." });
            } catch (err) {
                console.log("خطأ في تنفيذ العقوبة: تأكد أن البوت مشرف.");
            }
        }

        // أوامر السيطرة (خاصة بك فقط)
        if (text.startsWith('.add')) { 
            const numToAdd = text.split(' ')[1] + "@s.whatsapp.net";
            await sock.groupParticipantsUpdate(from, [numToAdd], "add");
            await sock.sendMessage(from, { text: "✅ تم إضافة العضو بنجاح." });
        }
    });

    // --- إدارة الاتصال وإعادة التشغيل ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('جارٍ إعادة الاتصال...');
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ البوت متصل الآن ومستعد للسيطرة الكاملة!');
        }
    });
}

startBot();

