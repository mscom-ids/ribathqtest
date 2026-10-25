const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');
const bcrypt = require('../backend/node_modules/bcrypt');

function validatePasscode(passcode) {
    if (passcode.length < 12) throw new Error('Use at least 12 characters.');
    if (Buffer.byteLength(passcode, 'utf8') > 72) throw new Error('Use no more than 72 UTF-8 bytes.');
    if (/[\u0000-\u001f\u007f]/.test(passcode)) throw new Error('Control characters are not allowed.');
}

async function main() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Run this command directly in an interactive PowerShell or terminal window.');
    }
    const hiddenOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const prompt = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true, historySize: 0 });
    const cancellation = new AbortController();
    prompt.on('SIGINT', () => cancellation.abort());
    let passcode = '';
    let confirmation = '';
    try {
        process.stdout.write('Choose a NEW WhatsApp admin passcode (12+ characters; input is hidden): ');
        passcode = await prompt.question('', { signal: cancellation.signal });
        process.stdout.write('\n');
        validatePasscode(passcode);
        process.stdout.write('Enter the same passcode again (input is hidden): ');
        confirmation = await prompt.question('', { signal: cancellation.signal });
        process.stdout.write('\n');
        if (passcode !== confirmation) throw new Error('Passcodes do not match. Run the command again.');
        const hash = await bcrypt.hash(passcode, 12);
        process.stdout.write(`\nCopy this complete hash into WHATSAPP_ADMIN_PASSCODE_HASH in the backend:\n\n${hash}\n\n`);
        process.stdout.write('Use Runtime only and Literal in Coolify, then redeploy the backend.\n');
        process.stdout.write('Unlock the portal with your new passcode, not this hash.\n');
        process.stdout.write('No files, live settings, launch cutoff, or sending switches were changed.\n');
    } finally {
        passcode = '';
        confirmation = '';
        prompt.close();
        hiddenOutput.end();
    }
}

module.exports = { validatePasscode, main };

if (require.main === module) {
    main().catch(error => {
        const safeErrors = new Set([
            'Use at least 12 characters.', 'Use no more than 72 UTF-8 bytes.', 'Control characters are not allowed.',
            'Passcodes do not match. Run the command again.',
            'Run this command directly in an interactive PowerShell or terminal window.',
        ]);
        process.stderr.write(`\n${error.name === 'AbortError' ? 'Cancelled.' : safeErrors.has(error.message) ? error.message : 'Could not generate the passcode hash.'}\n`);
        process.exitCode = 1;
    });
}
