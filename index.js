const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        // تغيير الهوية لتبدو كمتصفح سفاري على ماك
        browser: ["Safari", "MacOS", "14.1.2"] 
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = "967738044053";
        
        // انتظار 20 ثانية لضمان استقرار السيرفر قبل طلب الكود
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n✅ الكود المطلوب: ${code}\n`);
            } catch (error) {
                console.log("❌ خطأ: واتساب يرفض الطلب حالياً، انتظر ساعة.");
            }
        }, 20000);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') console.log('✅ تم الربط بنجاح! البوت يعمل.');
    });
}
startBot();
