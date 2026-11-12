// A refreshed snapshot must never redirect an edit to another song or duplicate.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/music-edit-intent.js'),'utf8'),sandbox);
const {capture,resolve}=sandbox.window.tocaMusicEditIntent;
const list=(ids,snapshot='s1',id='bar-list')=>({id,snapshot,tracks:ids.map(id=>({id}))});
const plain=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(resolve(capture(list(['A','B','C']),{action:'remove',position:1}),list(['X','A','B','C'],'s2'))),{action:'remove',position:2,snapshot:'s2'});
assert.equal(resolve(capture(list(['A','B']),{action:'remove',position:1}),list(['A'],'s2')),null);
assert.deepEqual(plain(resolve(capture(list(['A','B','C']),{action:'move',from:0,to:2}),list(['X','A','B','C'],'s2'))),{action:'move',from:1,to:3,snapshot:'s2'});
assert.deepEqual(plain(resolve(capture(list(['A','B','C']),{action:'move',from:2,to:0}),list(['X','A','B','C'],'s2'))),{action:'move',from:3,to:1,snapshot:'s2'});
assert.equal(resolve(capture(list(['A','B','C']),{action:'move',from:0,to:2}),list(['B','C','A'],'s2')),null);
assert.deepEqual(plain(resolve(capture(list(['A','B','A']),{action:'remove',position:2}),list(['A','B','A'],'s2'))),{action:'remove',position:2,snapshot:'s2'});
assert.throws(()=>resolve(capture(list(['A','B','A']),{action:'remove',position:2}),list(['X','A','B','A'],'s2')),/selección/);
assert.throws(()=>resolve(capture(list(['A','B']),{action:'add',trackId:'C'}),list(['A','B'],'s2','another-list')),/selección/);
console.log('PASS safe edit rebasing, exact duplicate positions, removed targets and playlist identity');
