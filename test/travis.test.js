const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClock, parseDuration, localAction } = require('../index');

test('parses 7:30 PM', () => assert.deepEqual(parseClock('alarm at 7:30 pm'), { hour: 19, minute: 30 }));
test('parses 08:05', () => assert.deepEqual(parseClock('alarm at 08:05'), { hour: 8, minute: 5 }));
test('parses timer duration', () => assert.equal(parseDuration('set a timer for 10 minutes'), 600));
test('routes flashlight on locally', () => assert.deepEqual(localAction('turn the flashlight on'), { name: 'set_flashlight', args: { state: 'on' } }));
test('routes volume locally', () => assert.deepEqual(localAction('set volume to 42%'), { name: 'set_volume', args: { level: 42 } }));
test('routes brightness locally', () => assert.deepEqual(localAction('brightness 60'), { name: 'set_brightness', args: { level: 60 } }));
test('routes URL locally', () => assert.deepEqual(localAction('open https://youtube.com'), { name: 'open_url', args: { url: 'https://youtube.com' } }));
test('routes common apps locally', () => assert.deepEqual(localAction('open youtube'), { name: 'open_app', args: { app: 'youtube' } }));
test('routes wifi locally', () => assert.deepEqual(localAction('turn wifi off'), { name: 'set_wifi', args: { state: 'off' } }));
test('routes bluetooth locally', () => assert.deepEqual(localAction('bluetooth on'), { name: 'set_bluetooth', args: { state: 'on' } }));
test('routes media locally', () => assert.deepEqual(localAction('next song'), { name: 'media_control', args: { action: 'next' } }));
test('routes timer locally', () => assert.deepEqual(localAction('set timer for 5 minutes'), { name: 'set_timer', args: { seconds: 300 } }));
test('routes lock locally', () => assert.deepEqual(localAction('lock the phone'), { name: 'lock_screen', args: {} }));
test('unknown natural language falls through', () => assert.equal(localAction('what is the weather today'), null));
