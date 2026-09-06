import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/scm-sales-import/handler.mjs';

const req=(method='POST',origin='https://gaeddirang.com',auth='')=>new Request('https://example.test',{method,headers:{origin,...(auth?{authorization:auth}:{})},body:method==='POST'?'{}':undefined});

test('sales importer rejects foreign origins and missing login before upstream calls',async()=>{
  let calls=0;const handler=makeHandler({env:()=>null,fetcher:async()=>{calls++;throw Error('unexpected')}});
  const foreign=await handler(req('POST','https://evil.example','Bearer nope'));assert.equal(foreign.status,403);
  const anonymous=await handler(req('POST'));assert.equal(anonymous.status,401);assert.equal(calls,0);
});

test('sales importer exposes POST-only CORS and validates body before Google access',async()=>{
  let calls=0;const handler=makeHandler({env:name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_ANON_KEY'?'public-key':null,fetcher:async()=>{calls++;throw Error('unexpected')}});
  const preflight=await handler(req('OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  const invalid=await handler(req('POST','https://gaeddirang.com','Bearer user'));assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'INVALID_PAYLOAD');assert.equal(calls,0);
});
