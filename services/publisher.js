import {db,get,github,secret} from './common.js';
import {UpdateCommand} from '@aws-sdk/lib-dynamodb';
export async function handler(event){
 const id=event.scan_id||event.detail?.scan_id;if(!id)throw Error('scan_id required');
 const j=await get(id);if(!j||!['COMPLETED','FAILED','TIMED_OUT'].includes(j.status)||j.check_published_at)return;
 const cfg=await secret();if(!cfg.github_token)throw Error('github_token secret missing');
 let conclusion='failure',summary=j.error||j.status;
 if(j.status==='COMPLETED'){
 const report=j.report;if(!report)throw Error('Completed scan has no report');
 conclusion=report.high>0?'failure':'success';summary=`${report.count} findings, ${report.high} HIGH severity`;}
 // GitHub API may accept a check before DynamoDB acknowledgement; retries can duplicate on network failures.
 // Production: use a persisted check-run ID and PATCH existing checks.
 const r=await github(`/repos/${j.repository}/check-runs`,'POST',{name:'MergeGuard SAST',head_sha:j.sha,status:'completed',conclusion,output:{title:`MergeGuard ${j.status}`,summary}},cfg.github_token);
 await db.send(new UpdateCommand({TableName:process.env.TABLE_NAME,Key:{scan_id:id},UpdateExpression:'SET check_published_at=:t, check_run_id=:r',ConditionExpression:'attribute_not_exists(check_published_at)',ExpressionAttributeValues:{':t':Date.now(),':r':r.id}})).catch(e=>{if(e.name!=='ConditionalCheckFailedException')throw e;});
}
