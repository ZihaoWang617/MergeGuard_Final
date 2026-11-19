import test from 'node:test';
import assert from 'node:assert/strict';
import { scanCode } from '../scanner/scanner.js';

const ids = (code) => scanCode(code).map((f) => f.id);
const detects = (code, id) => assert.ok(ids(code).includes(id), `${id} not detected in: ${code}`);
const ignores = (code, id) => assert.ok(!ids(code).includes(id), `${id} false positive in: ${code}`);

// Detection: one positive case per rule
test('HARDCODED_SECRET', () => detects('const password = "admin123";', 'HARDCODED_SECRET'));
test('NOSQL_INJECTION', () => detects('db.users.find(req.query)', 'NOSQL_INJECTION'));
test('XSS', () => detects('el.innerHTML = userInput;', 'XSS'));
test('PATH_TRAVERSAL', () => detects('fs.readFileSync(req.query.file)', 'PATH_TRAVERSAL'));
test('INSECURE_RANDOM', () => detects('const token = Math.random();', 'INSECURE_RANDOM'));
test('SENSITIVE_DATA_LOG', () => detects('console.log("password:", password);', 'SENSITIVE_DATA_LOG'));
test('SQL_INJECTION', () => detects('pool.query(`SELECT * FROM u WHERE id = ${id}`)', 'SQL_INJECTION'));
test('HARDCODED_IP', () => detects('const host = "192.168.1.10";', 'HARDCODED_IP'));
test('INSECURE_FUNCTION', () => detects('eval(userCode)', 'INSECURE_FUNCTION'));
test('SECURITY_TODO', () => detects('// TODO: add auth check', 'SECURITY_TODO'));
test('WEAK_CRYPTO md5', () => detects('crypto.createHash("md5")', 'WEAK_CRYPTO'));
test('WEAK_CRYPTO des cipher', () => detects('crypto.createCipheriv("des-cbc", k, iv)', 'WEAK_CRYPTO'));

// False-positive evaluation: safe code must not be flagged
test('FP: secret from env var', () => ignores('const password = process.env.DB_PASSWORD;', 'HARDCODED_SECRET'));
test('FP: textContent is safe', () => ignores('el.textContent = userInput;', 'XSS'));
test('FP: parameterized SQL', () => ignores('pool.query("SELECT * FROM u WHERE id = $1", [id])', 'SQL_INJECTION'));
test('FP: crypto.randomUUID', () => ignores('const id = crypto.randomUUID();', 'INSECURE_RANDOM'));
test('FP: sha256 is strong', () => ignores('crypto.createHash("sha256")', 'WEAK_CRYPTO'));
test('FP: word "describe"', () => ignores('// describe the request', 'WEAK_CRYPTO'));
test('FP: word "description"', () => ignores("const description = 'Product details';", 'WEAK_CRYPTO'));
test.todo('FP: RegExp.prototype.exec flagged as INSECURE_FUNCTION (precision vs recall trade-off)');
