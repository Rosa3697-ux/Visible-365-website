// Nationwide business discovery. Configure provider credentials server-side only.
export default async function handler(req, context) {
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 // Keep paid provider access disabled until deployment rate limits are configured.
 if(process.env.BUSINESS_LOOKUP_ENABLED!=="true")return reply({error:"lookup_unavailable"},503);
 if(Number(req.headers.get("content-length")||0)>2048)return reply({error:"invalid_input"},400);
 let body;try{const raw=await req.text();if(raw.length>2048)return reply({error:"invalid_input"},400);body=JSON.parse(raw)}catch{return reply({error:"invalid_input"},400)}
 const name=typeof body?.name==="string"?body.name.trim():"",zip=typeof body?.zip==="string"?body.zip.trim():"";
 if(name.length<2||name.length>100||!/^\d{5}$/.test(zip))return reply({error:"invalid_input"},400);
 const key=process.env.GOOGLE_PLACES_API_KEY;
 if(!key)return reply({error:"lookup_unavailable"},503);
 try{
 const r=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.websiteUri,places.nationalPhoneNumber"},body:JSON.stringify({textQuery:name+" "+zip+" United States",regionCode:"US",pageSize:5}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)return reply({error:"provider_unavailable"},502);
 const d=await r.json();return reply({source:"Google Maps",results:(d.places||[]).slice(0,5).map(p=>({id:p.id,name:p.displayName?.text||"",address:p.formattedAddress||"",category:p.primaryTypeDisplayName?.text||"",website:p.websiteUri||"",phone:p.nationalPhoneNumber||""}))});
 }catch{return reply({error:"provider_unavailable"},502)}
}
