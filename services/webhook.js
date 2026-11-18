import {crypto,db,sqs,secret,key,scanId,PutCommand,SendMessageCommand} from './common.js';
export async function handler(event){
 const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64'):Buffer.from(event.body||'');
 const cfg=await secret();const supplied=event.headers?.['x-hub-signature-256']||event.headers?.['X-Hub-Signature-256']||'';
 const expected='sha256='+crypto.createHmac('sha256',cfg.webhook_secret).update(raw).digest('hex');
 if(supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return {statusCode:401,body:'Invalid signature'};
 const kind=event.headers?.['x-github-event']||event.headers?.['X-GitHub-Event'];
 if(kind!=='pull_request')return {statusCode:202,body:'Ignored event'};
 const payload=JSON.parse(raw.toString());
 if(!['opened','synchronize','reopened'].includes(payload.action))return {statusCode:202,body:'Ignored action'};
 const repo=payload.repository?.full_name,sha=payload.pull_request?.head?.sha;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!/^[a-f0-9]{40}$/.test(sha||''))return {statusCode:400,body:'Invalid payload'};
 const id=scanId(key(repo,sha));
 const item={scan_id:id,repository:repo,sha,pr_number:payload.number,status:'QUEUED',created_at:Date.now(),updated_at:Date.now(),scanner_version:process.env.SCANNER_VERSION||'v1'};
 try{await db.send(new PutCommand({TableName:process.env.TABLE_NAME,Item:item,ConditionExpression:'attribute_not_exists(scan_id)'}));}catch(e){if(e.name==='ConditionalCheckFailedException')return {statusCode:200,body:JSON.stringify({scan_id:id,duplicate:true})};throw e;}
 // If enqueue fails, the sweeper requeues QUEUED records; never silently mark success.
 await sqs.send(new SendMessageCommand({QueueUrl:process.env.QUEUE_URL,MessageBody:JSON.stringify({scan_id:id})}));
 return {statusCode:202,body:JSON.stringify({scan_id:id})};
}
