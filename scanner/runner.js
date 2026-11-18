import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scanDirectory} from './scanner.js';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,UpdateCommand} from '@aws-sdk/lib-dynamodb';
const {REPO_FULL_NAME,COMMIT_SHA,SCAN_ID,TABLE_NAME}=process.env;
if(!/^[\w.-]+\/[\w.-]+$/.test(REPO_FULL_NAME||'') || !/^[a-f0-9]{40}$/.test(COMMIT_SHA||'') || !/^[a-zA-Z0-9._-]+$/.test(SCAN_ID||'')) throw Error('Invalid job input');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mergeguard-'));
try {
 // For public repositories only; use a GitHub App installation token for private repos.
 execFileSync('git',['clone','--quiet','--no-checkout','--depth','1',`https://github.com/${REPO_FULL_NAME}.git`,dir],{timeout:120000});
 execFileSync('git',['-C',dir,'fetch','--quiet','--depth','1','origin',COMMIT_SHA],{timeout:120000});
 execFileSync('git',['-C',dir,'checkout','--quiet','--detach','FETCH_HEAD'],{timeout:120000});
 const findings=scanDirectory(dir);
 const count=Object.values(findings).reduce((n,v)=>n+v.length,0);
 const high=Object.values(findings).flat().filter(x=>x.severity==='HIGH').length;
 const report={scan_id:SCAN_ID,repository:REPO_FULL_NAME,sha:COMMIT_SHA,status:'COMPLETED',count,high,findings,created_at:new Date().toISOString()};
 if(!TABLE_NAME) throw Error('TABLE_NAME is required');
 // DynamoDB item limit is 400 KB, including job metadata and attribute names.
 // Reserve headroom; fail explicitly instead of silently truncating findings.
 if(Buffer.byteLength(JSON.stringify(report),'utf8')>300000) throw Error('Report exceeds DynamoDB demo size limit (300 KB)');
 const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
 await db.send(new UpdateCommand({TableName:TABLE_NAME,Key:{scan_id:SCAN_ID},UpdateExpression:'SET #report = :report',ConditionExpression:'attribute_exists(scan_id)',ExpressionAttributeNames:{'#report':'report'},ExpressionAttributeValues:{':report':report}}));
 console.log(JSON.stringify({scan_id:SCAN_ID,count,high,report_saved:true}));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
