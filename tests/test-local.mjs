import test from 'node:test';import assert from 'node:assert/strict';
import {scanCode} from '../scanner/scanner.js';
test('provided SAST detects hardcoded password',()=>{const x=scanCode('const password = "admin123";');assert.ok(x.some(y=>y.id==='HARDCODED_SECRET'));});
test('clean code produces no findings',()=>{assert.equal(scanCode('const sum = (a,b) => a+b;').length,0);});
