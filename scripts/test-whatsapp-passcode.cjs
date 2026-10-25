const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('../backend/node_modules/bcrypt');
const { validatePasscode } = require('./generate-whatsapp-passcode.cjs');

async function main() {
    assert.doesNotThrow(() => validatePasscode('Synthetic-test-passphrase'));
    assert.throws(() => validatePasscode('short'));
    assert.throws(() => validatePasscode('a'.repeat(73)));
    const modulePath = path.join(__dirname, 'generate-whatsapp-passcode.cjs');
    const source = `Object.defineProperty(process.stdin, 'isTTY', { value: true });
        Object.defineProperty(process.stdout, 'isTTY', { value: true });
        require(${JSON.stringify(modulePath)}).main().catch(() => { process.exitCode = 1; });`;
    const child = spawn(process.execPath, ['-e', source], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    let supplied = 0;
    const passcode = 'Synthetic-test-passphrase';
    const timeout = setTimeout(() => child.kill(), 8000);
    child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (supplied === 0 && output.includes('input is hidden): ')) {
            supplied++;
            child.stdin.write(`${passcode}\n`);
        }
        if (supplied === 1 && output.includes('Enter the same passcode again')) {
            supplied++;
            child.stdin.write(`${passcode}\n`);
        }
    });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    const exitCode = await new Promise(resolve => child.once('exit', resolve));
    clearTimeout(timeout);
    assert.equal(exitCode, 0, `Generator did not complete: ${errors}; received ${supplied} prompts`);
    assert.ok(!output.includes(passcode), 'The passcode must never be echoed');
    const hash = output.match(/\$2b\$12\$[./A-Za-z0-9]{53}/)?.[0];
    assert.ok(hash, 'Expected a complete cost-12 bcrypt hash');
    assert.equal(await bcrypt.compare(passcode, hash), true);
    console.log('Hidden-input prompt, confirmation and cost-12 hash generation passed with synthetic data only.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
