// Sandbox authentication + onboarding gateway. No billing or admin mutations.
const Intake = (function makeIntake(){
 const groups=[
 {title:["Business identity","Identidad del negocio"],desc:["Tell us how customers know your business.","Cuéntanos cómo conocen tu negocio."],fields:[["display_name","Business name to display","Nombre público del negocio",120,true],["service_area","Cities, states or routes served","Ciudades, estados o rutas que atiendes",300,true],["business_model","How do you serve customers?","¿Cómo atiendes a tus clientes?",["mobile","location","remote","mixed"],false],["audience","Your ideal customer","Tu cliente ideal",500,false]]},
 {title:["Services and goals","Servicios y objetivos"],desc:["We use these answers to recommend your website structure.","Usaremos tus respuestas para recomendar la estructura."],fields:[["services","Main services (one per line)","Servicios principales (uno por línea)",1200,true],["specialty","Industry details","Detalles de tu industria",800,false],["goal","Main website objective","Objetivo principal de tu página",["quotes","calls","booking","credibility","recruiting"],true],["differentiator","Why should customers choose you?","¿Por qué deberían elegirte?",800,false]]},
 {title:["Customer contact","Contacto con clientes"],desc:["Only enter business contact details you want us to review for publication.","Ingresa solo datos comerciales que quieras revisar para publicar."],fields:[["contact_method","Preferred customer action","Acción preferida del cliente",["phone","form","email","whatsapp","booking"],true],["public_phone","Public business phone (optional)","Teléfono comercial público (opcional)",80,false],["public_email","Public business email (optional)","Correo comercial público (opcional)",200,false],["hours","Hours or availability","Horario o disponibilidad",250,false]]},
 {title:["Brand and language","Marca e idioma"],desc:["Choose a visual direction and the language your customers need.","Elige una dirección visual y el idioma de tus clientes."],fields:[["site_language","Website language","Idioma de la página",["en","es","bilingual"],true],["style","Visual direction","Estilo visual",["modern","premium","industrial","friendly","unsure"],false],["colors","Existing brand colors or preferences","Colores de marca o preferencias",300,false],["assets","Logo and photo readiness","Disponibilidad de logo y fotos",["ready","partial","none"],false],["proof","Reviews, credentials or work examples you can verify","Reseñas, credenciales o trabajos que puedes comprobar",1000,false]]},
 {title:["Domain and content","Dominio y contenido"],desc:["We will never ask for a password in this form.","Nunca solicitaremos contraseñas en este formulario."],fields:[["domain_status","Domain ownership","Estado del dominio",["owned","need","unsure"],false],["domain","Existing domain name","Dominio actual",250,false],["existing_site","Current website, if any","Página actual, si existe",300,false],["references","Example websites or design references","Páginas de referencia o inspiración",500,false],["notes","Other requirements or constraints","Otros requisitos o restricciones",1000,false]]}
 ];
 const options={mobile:["At customer locations","En ubicaciones de clientes"],location:["At my business location","En mi local"],remote:["Remote / online","Remoto / en línea"],mixed:["A combination","Una combinación"],quotes:["Get quote requests","Recibir solicitudes de cotización"],calls:["Get calls","Recibir llamadas"],booking:["Get bookings","Recibir citas"],credibility:["Build credibility","Generar confianza"],recruiting:["Recruit workers","Contratar personal"],phone:["Phone call","Llamada"],form:["Request form","Formulario"],email:["Email","Correo"],whatsapp:["WhatsApp","WhatsApp"],en:["English","Inglés"],es:["Spanish","Español"],bilingual:["English and Spanish","Inglés y español"],modern:["Clean and modern","Limpio y moderno"],premium:["Premium and refined","Premium y sofisticado"],industrial:["Bold and industrial","Fuerte e industrial"],friendly:["Warm and approachable","Cálido y cercano"],unsure:["Not sure yet","Aún no sé"],ready:["Logo and photos ready","Logo y fotos listos"],partial:["Some assets ready","Algunos recursos listos"],none:["Need guidance","Necesito orientación"],owned:["I own a domain","Tengo un dominio"],need:["I need a domain","Necesito un dominio"]};
 function prompt(industry){const i=String(industry||"").toLowerCase();if(/roof|techos|tejado/.test(i))return ["Roof types, repair vs replacement, storm work and warranties you actually offer.","Tipos de techo, reparación o reemplazo, trabajos por tormentas y garantías reales."];if(/truck|transport|camion|carrier/.test(i))return ["Freight types, equipment, lanes and whether you seek shippers or brokers.","Tipos de carga, equipo, rutas y si buscas clientes directos o brokers."];if(/paint|pint/.test(i))return ["Interior/exterior, residential/commercial and preparation services.","Interior/exterior, residencial/comercial y preparación."];if(/landscap|jardin/.test(i))return ["Maintenance, installation, irrigation and seasonal services.","Mantenimiento, instalación, riego y servicios de temporada."];if(/clean|limpieza/.test(i))return ["Residential, commercial, recurring and deep cleaning services.","Limpieza residencial, comercial, recurrente y profunda."];if(/contract|construc|remodel/.test(i))return ["Project types, trades, job size and areas of specialization.","Tipos de proyecto, oficios, tamaño y especialidades."];return ["Service specialties, equipment, qualifications or customer needs.","Especialidades, equipo, cualificaciones o necesidades de clientes."];}
 function visible(k,a){return k!=="domain"||a.domain_status==="owned";}
 function normalize(raw,plan,submit=false){if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid intake");let a={};for(const g of groups)for(const [k,en,es,rule] of g.fields){let v=raw[k]??"";if(typeof v!=="string")throw Error("Invalid field: "+k);v=v.trim();if(Array.isArray(rule)){if(v&&!rule.includes(v))throw Error("Invalid selection: "+k);}else if(v.length>rule)throw Error("Field too long: "+k);a[k]=v;}if(!visible("domain",a))a.domain="";if(a.public_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.public_email))throw Error("Invalid public email");if(a.domain&&(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(a.domain)))throw Error("Enter a domain name without https://");if(a.existing_site){try{let u=new URL(a.existing_site);if(!["https:","http:"].includes(u.protocol)||u.username||u.password)throw Error();}catch{throw Error("Enter a full website URL");}}const missing=groups.flatMap(g=>g.fields.filter(f=>f[4]&&visible(f[0],a)&&!a[f[0]]).map(f=>f[0]));if(a.domain_status==="owned"&&!a.domain)missing.push("domain");if(a.contact_method==="phone"&&!a.public_phone)missing.push("public_phone");if(a.contact_method==="whatsapp"&&!a.public_phone)missing.push("public_phone");if(a.contact_method==="email"&&!a.public_email)missing.push("public_email");if(submit&&missing.length)throw Error("Missing fields: "+missing.join(", "));return {answers:a,missing:[...new Set(missing)]};}
 function brief(account,plan,a){const pages=plan==="growth"?["Home","About","Services","Work / proof","Contact"]:["Home","Services","Contact"];let flags=[];if(a.assets!=="ready")flags.push("Collect or source approved brand assets");if(!a.proof)flags.push("Request verifiable proof before making claims");if(a.domain_status!=="owned")flags.push("Confirm domain selection and ownership");if(a.contact_method==="booking")flags.push("Review booking integration and scope");if(a.site_language==="bilingual")flags.push("Review both language versions with customer");if(a.contact_method==="form")flags.push("Confirm lead destination and privacy notice");return {version:1,business:a.display_name,industry:account.industry,plan,language:a.site_language,proposed_pages:pages,primary_goal:a.goal,primary_cta:a.contact_method,service_area:a.service_area,services:a.services,customer_profile:a.audience,brand_direction:a.style,answers:a,review_flags:flags,status:"scope_review_required",disclaimer:"Proposed brief only; no payment, publication or scope approval."};}
 return {groups,options,prompt,visible,normalize,brief};
})();

const origin = "https://deploy-preview-1--dreamy-dragon-e82e3e.netlify.app";
const ROOT = Deno.env.get("SUPABASE_URL") || "";
function key(name:string){try{return JSON.parse(Deno.env.get(name)||"{}").default||""}catch{return ""}}
// Temporary sandbox compatibility: gateway rejected the registered publishable key.
const publishable=Deno.env.get("SUPABASE_ANON_KEY")||key("SUPABASE_PUBLISHABLE_KEYS"),secret=key("SUPABASE_SECRET_KEYS");
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
  if(req.method==="GET")return respond(200,{service:"Visible365 sandbox",mode:"authentication-and-intake"});
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
  const raw=await req.text();if(raw.length>24000)return respond(413,{error:"Request too large"});
  let b;try{b=JSON.parse(raw)}catch{return respond(400,{error:"Invalid JSON"})}
  if(!b||typeof b!=="object")return respond(400,{error:"Invalid request"});
  const own="user_id=eq."+encodeURIComponent(u.id);
  const allowed=(Deno.env.get("WAAS_ADMIN_IDS")||"").split(",").map(id=>id.trim());
  // Supabase Auth verified this exact bearer token above.
  const claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
  const admin=allowed.includes(u.id)&&claims.aal==="aal2";
  if(b.action==="admin_list"){
   if(!admin)return respond(403,{error:"Administrator MFA required"});
   const accounts=await db("waas_accounts?select=user_id,business_name,intake_state,language&order=created_at.desc,user_id&limit=100");
   return respond(200,{accounts});
  }
  if(b.action==="request"){
   if(!["content","photos","support","other"].includes(b.category))throw err(400,"Invalid category");
   await db("waas_requests","POST",{user_id:u.id,category:b.category,details:input(b.details,3000,1)});
   return respond(200,{ok:true});
  }
  if(b.action==="me"){
   const [accounts,orders,projects,requests]=await Promise.all([
     db("waas_accounts?"+own+"&select=business_name,language,industry,website,notes,created_at,intake_answers,intake_state,intake_revision,intake_brief,intake_submitted_at"),
     db("waas_orders?"+own+"&select=id,plan,stage,scope,terms_version,accepted_at"),
     db("waas_projects?"+own+"&select=stage,preview_url,live_url,updated_at"),
     db("waas_requests?"+own+"&select=id,category,details,status,minutes,reply,created_at&order=created_at.desc&limit=50")]);
   return respond(200,{account:accounts[0]||null,order:orders[0]||null,project:projects[0]||null,requests,admin,billing_enabled:false});
  }
  if(b.action==="signup"){
   if(!["en","es"].includes(b.language))throw err(400,"Invalid plan or language");
   await db("rpc/waas_signup","POST",{p_user:u.id,p_business:input(b.business,120,1),p_language:b.language,p_industry:input(b.industry,80,1),p_website:input(b.website||"",300),p_notes:input(b.notes||"",3000),p_plan:"essential"});
   return respond(200,{ok:true});
  }
  if(b.action==="intake_save"){
   if(!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.submit!=="boolean")throw err(400,"Invalid revision");
   const [accounts,orders]=await Promise.all([db("waas_accounts?"+own+"&select=business_name,industry,intake_state,intake_revision"),db("waas_orders?"+own+"&select=plan,stage")]);
   const a=accounts[0],o=orders[0];if(!a||!o||!["requested","approved","active"].includes(o.stage)||a.intake_state!=="draft"||a.intake_revision!==b.revision)throw err(409,"Draft changed or is not editable");
   let checked;try{checked=Intake.normalize(b.answers,o.plan,b.submit)}catch(e){throw err(400,(e as Error).message)}
   const update={intake_answers:checked.answers,intake_revision:b.revision+1,...(b.submit?{intake_state:"submitted",intake_brief:Intake.brief(a,o.plan,checked.answers),intake_submitted_at:new Date().toISOString()}:{})};
   const result=await db("waas_accounts?"+own+"&intake_state=eq.draft&intake_revision=eq."+b.revision,"PATCH",update);
   if(result.length!==1)throw err(409,"Draft changed; reload");
   return respond(200,{ok:true,missing:checked.missing});
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
