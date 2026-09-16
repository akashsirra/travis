const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClock, localAction } = require('../index');

test('parses 7:30 PM', () => assert.deepEqual(parseClock('alarm at 7:30 pm'), { hour: 19, minute: 30 }));
test('parses 08:05', () => assert.deepEqual(parseClock('alarm at 08:05'), { hour: 8, minute: 5 }));
test('routes flashlight on locally', () => assert.deepEqual(localAction('turn the flashlight on'), { name: 'set_flashlight', args: { state: 'on' } }));
test('routes volume locally', () => assert.deepEqual(localAction('set volume to 42%'), { name: 'set_volume', args: { level: 42 } }));
test('routes brightness locally', () => assert.deepEqual(localAction('brightness 60'), { name: 'set_brightness', args: { level: 60 } }));
test('routes URL locally', () => assert.deepEqual(localAction('open https://youtube.com'), { name: 'open_url', args: { url: 'https://youtube.com' } }));
test('unknown natural language falls through', () => assert.equal(localAction('what is the weather today'), null));
