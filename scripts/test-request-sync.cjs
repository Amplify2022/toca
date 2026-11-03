const assert = require('node:assert/strict');
const create = require('../web/request-sync.js');
const store = () => { const m = new Map(); return {
  getItem: k => m.get(k) || null, setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k)
}; };
const settings = storage => ({storage, customerId: ()=>'customer-1', bearer: ()=>'Bearer customer', makeId: ()=>'request-key-1'});
(async()=>{
  const storage = store(); const calls = [];
  let attempts = 0;
  const api = async (url, options) => {
    calls.push({url,options});
    if (++attempts === 1) throw Error('response lost after server acceptance');
    return {commandId:'command-1',status:'PENDING'};
  };
  let client = create({...settings(storage),api});
  await assert.rejects(client.submit('venue','track',{trackId:'track'}));
  // A reloaded page must reuse the original key, not enqueue another command.
  client = create({...settings(storage),api});
  await client.submit('venue','track',{trackId:'track'});
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  await client.submit('venue','track',{trackId:'track'});
  assert.match(calls[2].url,/request-commands\/command-1$/);
  assert.equal(calls[2].options.headers.Authorization,'Bearer customer');
  assert.equal(calls.filter(x=>x.options.method==='POST').length,2);

  const statuses = ['UNCERTAIN','DISPATCHED'];
  client = create({...settings(storage),api:async()=>({commandId:'command-1',status:statuses.shift()})});
  await client.refresh('venue','track','command-1');
  assert.notEqual(storage.getItem('toca:request:customer-1:venue:track'),null);
  await client.refresh('venue','track','command-1');
  assert.equal(storage.getItem('toca:request:customer-1:venue:track'),null);

  client = create({...settings(storage),api:async()=>({commandId:'command-2',status:'FAILED'})});
  await client.submit('venue','track',{trackId:'track'});
  assert.equal(storage.getItem('toca:request:customer-1:venue:track'),null);

  storage.setItem('toca:request:customer-1:venue:track',JSON.stringify({commandId:'old-customer-command',idempotencyKey:'old'}));
  let newRequest = false;
  client = create({...settings(storage),customerId:()=>'customer-2',api:async(url,opts)=>{
    newRequest=opts.method==='POST'; return {commandId:'new-customer-command',status:'PENDING'};
  }});
  await client.submit('venue','track',{trackId:'track'});
  assert(newRequest,'Commands must stay scoped to the authenticated customer');
  console.log('PASS: durable request key reuse, status polling, uncertain retention, terminal cleanup and customer isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
