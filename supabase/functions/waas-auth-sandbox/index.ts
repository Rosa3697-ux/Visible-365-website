// Sandbox authentication + onboarding gateway. No billing or admin mutations.
const origin = "https://deploy-preview-1--dreamy-dragon-e82e3e.netlify.app";
const ROOT = Deno.env.get("SUPABASE_URL") || "";
function key(name:string){try{return JSON.parse(Deno.env.get(name)||"{}").default||""}catch{return ""}}
const publishable=key("SUPABASE_PUBLISHABLE_KEYS"),secret=key("SUPABASE_SECRET_KEYS");
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, apikey, content-type","vary":"Origin"};
const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
const err=(status:number,message:string)=>Object.assign(new Error(message),{status});
const validId=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const input=(v:unknown,max:number,min=0)=>{if(typeof v!=="string"||v.length>max||v.trim().length<min)throw err(400,"Invalid input");return v.trim()};
async function db(path:string,method="GET",body?:unknown){
 const r=await fetch(ROOT+"/rest/v1/"+path,{method,headers:{apikey:secret,"content-type":"application/json",prefer:"return=representation"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw err(502,"Database request failed");return await r.json();
}
Deno.serve(async req=>{
 try{
  if(req.method==="GET")return respond(200,{service:"Visible365 sandbox",mode:"authentication-only"});
  if(req.headers.get("origin")!==origin)return respond(403,{error:"Sandbox preview origin required"});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return respond(405,{error:"POST required"});
  if(!ROOT||!publishable||!secret)return respond(503,{error:"Sandbox environment unavailable"});
  const token=req.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return respond(401,{error:"Sign in required"});
  const au=await fetch(ROOT+"/auth/v1/user",{headers:{apikey:publishable,authorization:token},signal:AbortSignal.timeout(10000)});
  if(!au.ok)return respond(401,{error:"Session expired"});
  const u=await au.json();
  if(!validId(u.id)||!u.email_confirmed_at||u.is_anonymous)return respond(401,{error:"Verified email required"});
  const raw=await req.text();if(raw.length>12000)return respond(413,{error:"Request too large"});
  let b;try{b=JSON.parse(raw)}catch{return respond(400,{error:"Invalid JSON"})}
  if(!b||typeof b!=="object")return respond(400,{error:"Invalid request"});
  const own="user_id=eq."+encodeURIComponent(u.id);
  if(b.action==="me"){
   const [accounts,orders,projects,requests]=await Promise.all([
     db("waas_accounts?"+own+"&select=business_name,language,industry,website,notes,created_at"),
     db("waas_orders?"+own+"&select=id,plan,stage,scope,terms_version,accepted_at"),
     db("waas_projects?"+own+"&select=stage,preview_url,live_url,updated_at"),
     db("waas_requests?"+own+"&select=id,category,details,status,minutes,reply,created_at&order=created_at.desc&limit=50")]);
   return respond(200,{account:accounts[0]||null,order:orders[0]||null,project:projects[0]||null,requests,admin:false,billing_enabled:false});
  }
  if(b.action==="signup"){
   if(!["essential","growth"].includes(b.plan)||!["en","es"].includes(b.language))throw err(400,"Invalid plan or language");
   await db("rpc/waas_signup","POST",{p_user:u.id,p_business:input(b.business,120,1),p_language:b.language,p_industry:input(b.industry,80,1),p_website:input(b.website||"",300),p_notes:input(b.notes||"",3000),p_plan:b.plan});
   return respond(200,{ok:true});
  }
  if(b.action==="profile"){
   const result=await db("waas_accounts?"+own,"PATCH",{website:input(b.website||"",300),notes:input(b.notes||"",3000)});
   if(result.length!==1)throw err(409,"Account not found");
   return respond(200,{ok:true});
  }
  // Billing, admin, private uploads, paid requests and approval remain disabled.
  return respond(503,{error:"This feature is not enabled in the authentication sandbox"});
 }catch(e){const ex=e as {status?:number;message?:string};return respond(ex.status||500,{error:ex.status?ex.message:"Unexpected server error"})}
});
