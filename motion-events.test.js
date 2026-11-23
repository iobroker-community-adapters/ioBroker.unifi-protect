'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const testApi = typeof describe === 'function' ? { describe, it } : require('node:test');

function createAdapter(getMotions, downloadLastMotionThumb) {
    const sandbox = {
        module: { parent: {}, exports: {} },
        require(id) {
            if (id === '@iobroker/adapter-core') {
                return { Adapter: class { on() {} } };
            }
            if (id === 'stream') return require('node:stream');
            return {};
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8'), sandbox);
    const adapter = sandbox.module.exports({});
    const calls = [];
    adapter.config = { getMotions, downloadLastMotionThumb, statesFilter: { motions: ['timestamp'] } };
    adapter.log = { error(message) { throw new Error(message); } };
    adapter.createOwnChannel = id => calls.push(['channel', id]);
    adapter.createOwnState = (id, value, desc, states) => {
        calls.push(['state', id, value]);
        return states;
    };
    adapter.setTimeout = callback => callback();
    adapter.getThumbnailBase64 = (id, eventId, force, callback) => {
        calls.push(['image', id]);
        if (callback) callback();
    };
    adapter.addMotionEventsCameraName = id => calls.push(['name', id]);
    adapter.getState = (id, callback) => callback(null, null);
    adapter.processStateChanges = (states, instance, callback) => callback();
    return { adapter, calls };
}

testApi.describe('motion history configuration', () => {
    for (const onReady of [true, false]) {
        for (const getMotions of [true, false]) {
            for (const downloadLastMotionThumb of [true, false]) {
                testApi.it(`history=${getMotions}, startup=${onReady}, last thumbnail=${downloadLastMotionThumb}`, () => {
                    const { adapter, calls } = createAdapter(getMotions, downloadLastMotionThumb);
                    adapter.addMotionEvents([
                        { id: 'event1', camera: 'cam1', timestamp: 100, thumbnail: 'e-thumb1', score: 50 },
                        { id: 'event2', camera: 'cam1', timestamp: 200, thumbnail: 'e-thumb2', score: 60 },
                    ], onReady);
                    const history = calls.filter(call => /^motions\.event[12](\.|$)/.test(call[1]));
                    if (!getMotions) assert.equal(history.length, 0);
                    else {
                        for (const eventId of ['event1', 'event2']) {
                            assert.ok(history.some(call => call[0] === 'state' && call[1] === `motions.${eventId}.timestamp`));
                            assert.ok(history.some(call => call[0] === 'image' && call[1] === `motions.${eventId}.thumbnail_image`));
                            assert.ok(history.some(call => call[0] === 'image' && call[1] === `motions.${eventId}.thumbnail_image_small`));
                            assert.ok(history.some(call => call[0] === 'name' && call[1] === `motions.${eventId}.camera_name`));
                        }
                        assert.equal(history.filter(call => call[0] === 'channel').length, onReady ? 2 : 0);
                    }
                    assert.ok(calls.some(call => call[0] === 'state' && call[1] === 'motions.lastMotion.timestamp' && call[2] === 200));
                    assert.ok(calls.some(call => call[0] === 'name' && call[1] === 'motions.lastMotion.camera_name'));
                    assert.equal(calls.some(call => call[0] === 'image' && call[1] === 'motions.lastMotion.thumbnail_image'), downloadLastMotionThumb);
                    assert.equal(adapter.motionsDone, true);
                });
            }
        }
    }
    testApi.it('completes an empty event response without creating objects', () => {
        const { adapter, calls } = createAdapter(false, true);
        adapter.addMotionEvents([], true);
        assert.equal(calls.length, 0);
        assert.equal(adapter.motionsDone, true);
    });
});
