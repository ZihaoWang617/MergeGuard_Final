import {get} from './common.js';
const json=(code,data)=>({statusCode:code,headers:{'content-type':'application/json','access-control-allow-origin':process.env.DASHBOARD_ORIGIN||'http://localhost:8000'},body:JSON.stringify(data)});
export async function handler(event){
 const claims=event.requestContext?.authorizer?.jwt?.claims;
 if(!claims?.sub)return json(401,{error:'Unauthorized'});
 // Single-user class demo: Cognito subject AND configured repository allowlist.
 // Do not use this authorization model for a multi-tenant product.
 if(!process.env.DEMO_USER_SUB||claims.sub!==process.env.DEMO_USER_SUB)return json(403,{error:'User not allowed'});
 const id=event.pathParameters?.id;if(!/^[a-f0-9]{64}$/.test(id||''))return json(400,{error:'Invalid scan ID'});
 const job=await get(id);if(!job)return json(404,{error:'Not found'});
 if(!process.env.ALLOWED_REPO||job.repository.toLowerCase()!==process.env.ALLOWED_REPO.toLowerCase())return json(403,{error:'Repository not allowed'});
 if(event.rawPath?.endsWith('/report')){if(job.status!=='COMPLETED')return json(409,{error:'Report not ready'});return json(200,{report:job.report});}
 return json(200,{scan_id:id,status:job.status,repository:job.repository,sha:job.sha,error:job.error||null});
}
