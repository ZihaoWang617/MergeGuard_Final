import {db,sqs,ScanCommand,SendMessageCommand,update} from './common.js';
import {notify} from './notify.js';
export async function handler(){const now=Date.now(),timeout=Number(process.env.SCAN_TIMEOUT_MS||900000);let cursor;
 do{const page=await db.send(new ScanCommand({TableName:process.env.TABLE_NAME,ExclusiveStartKey:cursor,FilterExpression:'#s IN (:q,:r,:st,:f,:c,:t)',ExpressionAttributeNames:{'#s':'status'},ExpressionAttributeValues:{':q':'QUEUED',':r':'RUNNING',':st':'STARTING',':f':'FAILED',':c':'COMPLETED',':t':'TIMED_OUT'}}));
 for(const j of page.Items||[]){
 if(j.status==='QUEUED'&&now-j.updated_at>60000){await sqs.send(new SendMessageCommand({QueueUrl:process.env.QUEUE_URL,MessageBody:JSON.stringify({scan_id:j.scan_id})}));await update(j.scan_id,'QUEUED','QUEUED',{updated_at:now});}
 if(['RUNNING','STARTING'].includes(j.status)&&now-j.updated_at>timeout){if(await update(j.scan_id,j.status,'TIMED_OUT',{updated_at:now,error:'Scan timed out'}))await notify(j.scan_id);}
 if(['FAILED','COMPLETED','TIMED_OUT'].includes(j.status)&&!j.check_published_at)await notify(j.scan_id);
 }cursor=page.LastEvaluatedKey;}while(cursor);
}
