import {ECSClient,RunTaskCommand} from '@aws-sdk/client-ecs';
import {get,update} from './common.js';
const ecs=new ECSClient({});
export async function handler(event){const failed=[];
 for(const record of event.Records||[]){let id;
 try{({scan_id:id}=JSON.parse(record.body));const j=await get(id);if(!j||j.status!=='QUEUED')continue;
 if(!await update(id,'QUEUED','STARTING',{updated_at:Date.now()}))continue;
 const r=await ecs.send(new RunTaskCommand({cluster:process.env.ECS_CLUSTER,taskDefinition:process.env.TASK_DEFINITION,launchType:'FARGATE',networkConfiguration:{awsvpcConfiguration:{subnets:process.env.PRIVATE_SUBNET_IDS.split(','),securityGroups:[process.env.SCANNER_SG_ID],assignPublicIp:'DISABLED'}},overrides:{containerOverrides:[{name:'scanner',environment:[{name:'SCAN_ID',value:id},{name:'REPO_FULL_NAME',value:j.repository},{name:'COMMIT_SHA',value:j.sha},{name:'TABLE_NAME',value:process.env.TABLE_NAME}]}]}}));
 if(r.failures?.length||!r.tasks?.[0]?.taskArn)throw Error('ECS RunTask failed: '+JSON.stringify(r.failures));
 await update(id,'STARTING','RUNNING',{task_arn:r.tasks[0].taskArn,updated_at:Date.now()});
 }catch(e){console.error(JSON.stringify({scan_id:id,error:e.message}));if(id)await update(id,'STARTING','QUEUED',{updated_at:Date.now()});failed.push({itemIdentifier:record.messageId});}}
 return {batchItemFailures:failed};
}
