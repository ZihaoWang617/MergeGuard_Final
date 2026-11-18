import crypto from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand,UpdateCommand,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {SQSClient,SendMessageCommand} from '@aws-sdk/client-sqs';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
export const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const sqs=new SQSClient({});
export const key=(repo,sha,version=process.env.SCANNER_VERSION||'v1')=>`${repo}#${sha}#${version}`;
export const scanId=k=>crypto.createHash('sha256').update(k).digest('hex');
export const get=async id=>(await db.send(new GetCommand({TableName:process.env.TABLE_NAME,Key:{scan_id:id}}))).Item;
export const update=async(id,from,to,extra={})=>{
 const names={'#s':'status'}; const values={':old':from,':new':to};
 let expression='SET #s = :new';let i=0;
 for(const [k,v] of Object.entries(extra)){const a=`#k${i}`,b=`:v${i}`;names[a]=k;values[b]=v;expression+=`, ${a} = ${b}`;i++;}
 try {await db.send(new UpdateCommand({TableName:process.env.TABLE_NAME,Key:{scan_id:id},UpdateExpression:expression,ConditionExpression:'#s = :old',ExpressionAttributeNames:names,ExpressionAttributeValues:values}));return true;}catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e;}
};
export async function secret(){const x=await new SecretsManagerClient({}).send(new GetSecretValueCommand({SecretId:process.env.GITHUB_SECRET_ARN}));return JSON.parse(x.SecretString);}
export async function github(path,method,body,token){const r=await fetch(`https://api.github.com${path}`,{method,headers:{'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(`GitHub ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json();}
export {crypto,GetCommand,PutCommand,ScanCommand,SendMessageCommand};
