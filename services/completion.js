import {db,get,update} from './common.js';
import {QueryCommand} from '@aws-sdk/lib-dynamodb';
import {notify} from './notify.js';
export async function handler(event){
 const d=event.detail||{};if(d.lastStatus!=='STOPPED'||!d.taskArn)return;
 const rows=(await db.send(new QueryCommand({TableName:process.env.TABLE_NAME,IndexName:'task-index',KeyConditionExpression:'task_arn = :t',ExpressionAttributeValues:{':t':d.taskArn}}))).Items||[];
 for(const row of rows){const j=await get(row.scan_id);if(!j||!['STARTING','RUNNING'].includes(j.status))continue;
 const exit=d.containers?.find(c=>c.name==='scanner')?.exitCode;
 let ok=exit===0;
 if(ok && !j.report) ok=false;
 if(await update(j.scan_id,j.status,ok?'COMPLETED':'FAILED',{updated_at:Date.now(),error:ok?'':`Scanner stopped (exit ${exit??'unknown'}); report ${ok?'found':'missing or failed'}`})){if(!ok)console.error('MERGEGUARD_FAILED',j.scan_id);await notify(j.scan_id);}
 }
}
