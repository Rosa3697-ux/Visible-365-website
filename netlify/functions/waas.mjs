// Test-only Netlify API. No external packages. Never expose service-role or Stripe keys.
import { createHmac, timingSafeEqual } from 'node:crypto';
const E=process.env;
export const PLAN={essential:{setup:29900,monthly:14900,minutes:30},growth:{setup:49900,monthly:24900,minutes:60}};
export function signatureOK(body,header,secret,now=Math.floor(Date.now()/1000)){
 if(!header||!secret)return false;
 const parts=header.split(',').map(x=>x.split('='));const ts=Number(parts.find(x=>x[0]==='t')?.[1]);
 if(!Number.isInteger(ts)||Math.abs(now-ts)>300)return false;
 const hash=createHmac('sha256',secret).update(ts+'.'+body).digest();
 return parts.filter(x=>x[0]==='v1'&&/^[a-f0-9]{64}$/i.test(x[1])).some(x=>timingSafeEqual(hash,Buffer.from(x[1],'hex')));
}
export function billingStage(status,paid){return status==='canceled'||status==='incomplete_expired'?'canceled':status==='active'&&paid?'active':['past_due','unpaid','paused'].includes(status)?'payment_issue':'checkout_pending'}
export function isAdmin(user,token,allow){try{return allow.split(',').map(s=>s.trim()).includes(user.id)&&JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aal==='aal2'}catch{return false}}
const reply=(status,obj)=>({statusCode:status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(obj)});
const fail=(status,msg)=>Object.assign(new Error(msg),{status});
function ready(){return E.WAAS_SANDBOX_ENABLED==='true'&&E.CONTEXT!=='production'&&/^sk_test_|^rk_test_/.test(E.STRIPE_SECRET_KEY||'')&&E.SUPABASE_URL&&E.SUPABASE_ANON_KEY&&E.SUPABASE_SERVICE_ROLE_KEY&&E.WAAS_ORIGIN}
async function api(url,options){const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});const s=await r.text();let data;try{data=s?JSON.parse(s):null}catch{throw fail(502,'Invalid provider response')}if(!r.ok)throw fail(502,'Provider request failed');return data}
const sb=(path,method='GET',body,token=E.SUPABASE_SERVICE_ROLE_KEY,anon=false)=>api(E.SUPABASE_URL.replace(/\/$/,'')+path,{method,headers:{apikey:anon?E.SUPABASE_ANON_KEY:E.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const q=encodeURIComponent;
const rows=(table,filter='')=>sb('/rest/v1/'+table+'?'+filter);
const patch=(table,filter,body)=>sb('/rest/v1/'+table+'?'+filter,'PATCH',body);
const insert=(table,body)=>sb('/rest/v1/'+table,'POST',body);
const own=u=>'user_id=eq.'+q(u);
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function str(v,max,min=0){if(typeof v!=='string'||v.trim().length<min||v.length>max)throw fail(400,'Invalid field');return v.trim()}
async function stripe(path,params,idem){const body=params?new URLSearchParams(params):undefined;return api('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{authorization:'Bearer '+E.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded',...(idem?{'idempotency-key':idem}:{})},body})}
function prices(plan){const p=PLAN[plan];if(!p)throw fail(400,'Invalid plan');const prefix=plan.toUpperCase();const setup=E['STRIPE_'+prefix+'_SETUP_PRICE'],monthly=E['STRIPE_'+prefix+'_MONTHLY_PRICE'];if(!setup||!monthly)throw fail(503,'Test prices not configured');return {setup,monthly}}
async function validatePrices(plan){let ids=prices(plan),[s,m]=await Promise.all([stripe('prices/'+q(ids.setup)),stripe('prices/'+q(ids.monthly))]);if(s.livemode||m.livemode||!s.active||!m.active||s.currency!=='usd'||m.currency!=='usd'||s.unit_amount!==PLAN[plan].setup||m.unit_amount!==PLAN[plan].monthly||s.type!=='one_time'||m.recurring?.interval!=='month'||m.recurring?.interval_count!==1||s.tax_behavior!=='exclusive'||m.tax_behavior!=='exclusive')throw fail(503,'Test catalog does not match approved pricing');return ids}
async function audit(actor,action,subject){await insert('waas_audit',{actor,action,subject})}
async function webhook(ev,raw){
 if(!signatureOK(raw,ev.headers['stripe-signature'],E.STRIPE_WEBHOOK_SECRET))throw fail(400,'Invalid signature');
 const event=JSON.parse(raw);if(event.livemode!==false)throw fail(400,'Wrong mode');
 if(!['checkout.session.completed','invoice.paid','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))return reply(200,{ignored:true});
 const obj=event.data.object;let subid=event.type.startsWith('customer.subscription.')?obj.id:obj.subscription||obj.parent?.subscription_details?.subscription;if(typeof subid!=='string')return reply(200,{ignored:true});
 const sub=await stripe('subscriptions/'+q(subid)+'?expand%5B%5D=latest_invoice');
 const oid=sub.metadata?.waas_order_id;if(!uuid(oid))return reply(200,{ignored:true});
 const [o]=await rows('waas_orders','id=eq.'+q(oid));if(!o||o.stripe_customer_id!==sub.customer||sub.livemode!==false)throw fail(409,'Order mismatch');
 const invoice=sub.latest_invoice;let paid=typeof invoice==='object'&&invoice?.status==='paid';
 const stage=billingStage(sub.status,paid);
 await sb('/rest/v1/rpc/waas_apply_event','POST',{p_event:event.id,p_created:event.created,p_order:oid,p_customer:sub.customer,p_subscription:sub.id,p_status:sub.status,p_stage:stage});
 return reply(200,{ok:true});
}
export async function handler(ev){try{
 if(!ready())throw fail(503,'Sandbox configuration pending');
 if(ev.httpMethod!=='POST')throw fail(405,'POST only');
 let raw=ev.isBase64Encoded?Buffer.from(ev.body||'','base64').toString('utf8'):ev.body||'';
 if(raw.length>40000)throw fail(413,'Request too large');
 if(ev.headers['stripe-signature'])return await webhook(ev,raw);
 if(ev.headers.origin!==E.WAAS_ORIGIN)throw fail(403,'Invalid origin');
 let b;try{b=JSON.parse(raw)}catch{throw fail(400,'Invalid JSON')}
 const action=b.action;
 if(action==='otp'){const email=str(b.email,254,3);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Invalid email');await sb('/auth/v1/otp','POST',{email,create_user:true},E.SUPABASE_ANON_KEY,true);return reply(200,{ok:true})}
 if(action==='verify'){const email=str(b.email,254,3),token=str(b.code,8,6);if(!/^\d{6,8}$/.test(token))throw fail(400,'Invalid code');const a=await sb('/auth/v1/verify','POST',{email,token,type:'email'},E.SUPABASE_ANON_KEY,true);return reply(200,{access_token:a.access_token})}
 const token=String(ev.headers.authorization||'').replace(/^Bearer /i,'');if(!token)throw fail(401,'Sign in required');
 let user;try{user=await sb('/auth/v1/user','GET',undefined,token,true)}catch{throw fail(401,'Session expired')}
 if(!uuid(user?.id)||!user.email_confirmed_at)throw fail(401,'Verified account required');
 const u=user.id,filter=own(u),admin=isAdmin(user,token,E.WAAS_ADMIN_IDS||'');
 if(action==='me'){const [a,o,p,r]=await Promise.all([rows('waas_accounts',filter),rows('waas_orders',filter),rows('waas_projects',filter),rows('waas_requests',filter+'&order=created_at.desc&limit=50')]);return reply(200,{account:a[0]||null,order:o[0]?{id:o[0].id,plan:o[0].plan,stage:o[0].stage,scope:o[0].scope,terms_version:o[0].terms_version,accepted_at:o[0].accepted_at}:null,project:p[0]||null,requests:r,admin})}
 if(action==='signup'){if(!PLAN[b.plan]||!['en','es'].includes(b.language))throw fail(400,'Invalid plan or language');await sb('/rest/v1/rpc/waas_signup','POST',{p_user:u,p_business:str(b.business,120,1),p_language:b.language,p_industry:str(b.industry,80,1),p_website:str(b.website||'',300),p_notes:str(b.notes||'',3000),p_plan:b.plan});return reply(200,{ok:true})}
 if(action==='profile'){await patch('waas_accounts',filter,{website:str(b.website||'',300),notes:str(b.notes||'',3000)});return reply(200,{ok:true})}
 if(action==='request'){if(!['content','photos','support','other'].includes(b.category))throw fail(400,'Invalid category');const [order]=await rows('waas_orders',filter);if(!order||!['active','payment_issue'].includes(order.stage))throw fail(403,'Subscription required');await insert('waas_requests',{user_id:u,category:b.category,details:str(b.details,3000,1)});return reply(200,{ok:true})}
 if(action==='checkout'){let [o]=await rows('waas_orders',filter);if(!o||!['approved','checkout_pending'].includes(o.stage)||!E.WAAS_TERMS_VERSION||!E.WAAS_TERMS_URL||o.terms_version!==E.WAAS_TERMS_VERSION||b.terms_version!==o.terms_version||b.accept!==true)throw fail(409,'Approved scope and current terms required');
 if(E.WAAS_TAX_READY!=='true')throw fail(503,'Tax setup pending');const ids=await validatePrices(o.plan);
 if(!o.stripe_customer_id){const c=await stripe('customers',{email:user.email,'metadata[waas_user_id]':u},'waas-customer-'+u);await patch('waas_orders',filter+'&stripe_customer_id=is.null',{stripe_customer_id:c.id});[o]=await rows('waas_orders',filter)}
 if(o.stripe_subscription_id)throw fail(409,'Subscription already exists');
 if(o.stripe_session_id){const s=await stripe('checkout/sessions/'+q(o.stripe_session_id));if(s.status==='open')return reply(200,{url:s.url});throw fail(409,'Previous checkout requires reconciliation')}
 const s=await stripe('checkout/sessions',{mode:'subscription',customer:o.stripe_customer_id,'line_items[0][price]':ids.monthly,'line_items[0][quantity]':'1','line_items[1][price]':ids.setup,'line_items[1][quantity]':'1','automatic_tax[enabled]':'true',billing_address_collection:'required','customer_update[address]':'auto','subscription_data[metadata][waas_order_id]':o.id,'metadata[waas_order_id]':o.id,success_url:E.WAAS_ORIGIN+'/waas/?result=checkout',cancel_url:E.WAAS_ORIGIN+'/waas/?result=canceled'},'waas-checkout-'+o.id);
 await patch('waas_orders',filter,{accepted_at:new Date().toISOString(),stage:'checkout_pending',stripe_session_id:s.id});return reply(200,{url:s.url})}
 if(action==='billing'){const [o]=await rows('waas_orders',filter);if(!o?.stripe_customer_id||!o.stripe_subscription_id||!E.STRIPE_PORTAL_CONFIG)throw fail(409,'Billing portal not configured');const s=await stripe('billing_portal/sessions',{customer:o.stripe_customer_id,configuration:E.STRIPE_PORTAL_CONFIG,return_url:E.WAAS_ORIGIN+'/waas/'});return reply(200,{url:s.url})}
 if(action.startsWith('admin_')){if(!admin)throw fail(403,'Administrator MFA required');
 if(action==='admin_list'){const [accounts,orders,projects,requests]=await Promise.all(['waas_accounts','waas_orders','waas_projects','waas_requests'].map(n=>rows(n,'limit=100')));return reply(200,{accounts,orders,projects,requests})}
 if(!uuid(b.user_id))throw fail(400,'Invalid account');
 const f=own(b.user_id);
 if(action==='admin_approve'){if(!E.WAAS_TERMS_VERSION||!E.WAAS_TERMS_URL)throw fail(503,'Terms not configured');const r=await patch('waas_orders',f+'&stage=eq.requested',{stage:'approved',scope:str(b.scope,5000,10),terms_version:E.WAAS_TERMS_VERSION});if(r.length!==1)throw fail(409,'Order not pending')}
 else if(action==='admin_project'){if(!['onboarding','design','review','domain','live'].includes(b.stage))throw fail(400,'Invalid stage');const url=b.preview_url?str(b.preview_url,400):null,live=b.live_url?str(b.live_url,400):null;if([url,live].some(x=>x&&!/^https:\/\//i.test(x)))throw fail(400,'HTTPS URL required');await patch('waas_projects',f,{stage:b.stage,preview_url:url,live_url:live,updated_at:new Date().toISOString()})}
 else if(action==='admin_request'){if(!uuid(b.id)||!['new','in_progress','done'].includes(b.status)||!Number.isInteger(b.minutes)||b.minutes<0||b.minutes>6000)throw fail(400,'Invalid request');await patch('waas_requests',f+'&id=eq.'+q(b.id),{status:b.status,minutes:b.minutes,reply:str(b.reply||'',3000),updated_at:new Date().toISOString()})}
 else throw fail(404,'Unknown action');await audit(u,action,b.user_id);return reply(200,{ok:true})}
 if(action==='approve_design'){const [project]=await rows('waas_projects',filter);if(project?.stage!=='review')throw fail(409,'Design is not ready for approval');await patch('waas_projects',filter+'&stage=eq.review',{stage:'approved',updated_at:new Date().toISOString()});await audit(u,action,u);return reply(200,{ok:true})}
 throw fail(404,'Unknown action');
 }catch(err){return reply(err.status||500,{error:err.status?err.message:'Unexpected server error'})}}
