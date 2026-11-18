// Public dashboard assets served over API Gateway's HTTPS endpoint; no CloudFront.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site-assets');
export async function handler(event) {
  const route = event.rawPath || '/';
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (route === '/config.js') {
    const host = event.requestContext?.domainName;
    if (!host) return {statusCode:500,body:'Missing API host'};
    const cfg = {api:`https://${host}`,cognitoDomain:process.env.COGNITO_DOMAIN,clientId:process.env.COGNITO_CLIENT_ID,redirectUri:`https://${host}/`};
    return {statusCode:200,headers:{...headers,'content-type':'application/javascript; charset=utf-8'},body:`window.MERGEGUARD_CONFIG=${JSON.stringify(cfg)};`};
  }
  const filename = route === '/' || route === '/index.html' ? 'index.html' : route === '/app.js' ? 'app.js' : null;
  if (!filename) return {statusCode:404,body:'Not found'};
  return {statusCode:200,headers:{...headers,'content-type':filename.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8'},body:fs.readFileSync(path.join(root,filename),'utf8')};
}
