import {LambdaClient,InvokeCommand} from '@aws-sdk/client-lambda';
const lambda=new LambdaClient({});
export async function notify(scan_id){await lambda.send(new InvokeCommand({FunctionName:process.env.PUBLISHER_FUNCTION,InvocationType:'Event',Payload:Buffer.from(JSON.stringify({scan_id}))}));}
