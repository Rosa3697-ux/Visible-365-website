import test from 'node:test';
import assert from 'node:assert/strict';

const owner='93153970-5545-417a-a622-62428444c00a';
const other='18623f43-7668-4fde-a32e-7fa26de1ff26';
const origin='https://deploy-preview-1--dreamy-dragon-e82e3e.netlify.app';
let handle;
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SECRET_KEYS:'{"default":"fixture"}',WAAS_ADMIN_IDS:owner};
globalThis.Deno={env:{get:key=>env[key]},serve:fn=>{handle=fn}};
await import('../supabase/functions/waas-auth-sandbox/index.ts');
function request(body,aal='aal1'){
 const claims=Buffer.from(JSON.stringify({aal})).toString('base64url');
 return new Request('https://fixture.invalid/function',{method:'POST',headers:{origin,authorization:'Bearer header.'+claims+'.signature'},body:JSON.stringify(body)});
}
test('gateway scopes customer records to the verified identity and restricts the staff queue',async t=>{
 const paths=[];
 t.mock.method(globalThis,'fetch',async (url, options)=>{
   const path=new URL(url);
   if(path.pathname==='/auth/v1/user')return Response.json({id:owner,email_confirmed_at:'2026-01-01'});
   paths.push([path.pathname,path.searchParams,options.body]);
   return Response.json([]);
 });
 const customer=await handle(request({action:'me',user_id:other}));
 assert.equal(customer.status,200);
 assert.equal((await customer.json()).admin,false);
 assert.equal(paths.length,4);
 for(const [,filters] of paths)assert.equal(filters.get('user_id'),'eq.'+owner);
 assert.equal((await handle(request({action:'admin_list'}))).status,403);
 assert.equal((await handle(request({action:'admin_list'},'aal2'))).status,200);
 assert.equal((await handle(request({action:'request',user_id:other,category:'support',details:'Fictional inquiry'}))).status,200);
 assert.equal(JSON.parse(paths.at(-1)[2]).user_id,owner);
});
