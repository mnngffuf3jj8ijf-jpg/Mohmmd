const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

async function startBot() {
    // 1. إعداد حالة التخزين (حفظ الجلسة)
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    // 2. إعداد الاتصال
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false, // معطل للاستضافات
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // 3. آلية الاقتران التلقائي برقمك (تعديل السيطرة)
    if (!sock.authState.creds.registered) {
        const phoneNumber = "967781166304"; // رقمك المعتمد
        
        // تأخير بسيط لضمان استقرار السيرفر قبل طلب الكود
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`🔥 كود الربط الخاص بك هو: ${code}`);
                console.log(`========================================\n`);
                console.log('افتح الواتساب > الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف وأدخل الكود أعلاه.');
            } catch (error) {
                console.error("فشل في طلب كود الربط:", error);
            }
        }, 3000);
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

        // قائمة "الكلمات المحظورة" (نظام الطرد التلقائي)
        const blacklist = ["مسبات", "روابط", "شتم"];
        
        if (isGroup && blacklist.some(word => text.includes(word))) {
            try {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
                await sock.sendMessage(from, { text: "🛑 تم اكتشاف انتهاك للمجموعة.\nتم طرد العضو وتطهير الدردشة." });
            } catch (err) {
                console.log("خطأ: تأكد من رفع البوت لرتبة مشرف (Admin) للسيطرة.");
            }
        }

        // أوامر الإضافة (للمطور فقط)
        if (text.startsWith('.add')) { 
            const numToAdd = text.split(' ')[1] + "@s.whatsapp.net";
            await sock.groupParticipantsUpdate(from, [numToAdd], "add");
            await sock.sendMessage(from, { text: "✅ تم سحب العضو للمجموعة بنجاح." });
        }
    });

    // --- إعادة الاتصال التلقائي ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ البوت متصل الآن! جاهز لتنفيذ الأوامر.');
        }
    });
}

startBot();
