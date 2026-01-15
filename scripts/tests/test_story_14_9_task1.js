
const assert = require('assert');
const adminGroup = require('../../bot/handlers/adminGroup');

console.log('Testing ATUALIZADOS_PATTERN...');

if (!adminGroup.ATUALIZADOS_PATTERN) {
    console.error('Stack Trace: ATUALIZADOS_PATTERN not exported from adminGroup.js');
    process.exit(1);
}

const pattern = adminGroup.ATUALIZADOS_PATTERN;

// Teste 1: /atualizados
assert.match('/atualizados', pattern, 'Should match /atualizados');
assert.strictEqual('/atualizados'.match(pattern)[1], undefined, 'Should not have capture group for simple command');

// Teste 2: /atualizados 1
assert.match('/atualizados 1', pattern, 'Should match /atualizados 1');
assert.strictEqual('/atualizados 1'.match(pattern)[1], '1', 'Should capture page number 1');

// Teste 3: /atualizados 10
assert.match('/atualizados 10', pattern, 'Should match /atualizados 10');
assert.strictEqual('/atualizados 10'.match(pattern)[1], '10', 'Should capture page number 10');

// Teste 4: Case insensitive
assert.match('/Atualizados', pattern, 'Should be case insensitive');

console.log('All tests passed!');
