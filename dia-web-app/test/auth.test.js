'use strict';
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const bcrypt=require('bcryptjs');
const {createDatabase}=require('../src/db');
const {createApp}=require('../src/server');
let db,agent,app;
const valid='valid-google-id-token-sentinel-for-a-mocked-verifier';
const verifier={async verifyIdToken({idToken,audience}){if(audience!=='test-client'||idToken!==valid)throw Error('bad token');return{getPayload:()=>({sub:'google-sub-1',email:'member@example.com',email_verified:true,name:'Dia Member',picture:'https://example.com/avatar.png'})};}};
beforeEach(()=>{db=createDatabase(':memory:');({app}=createApp({db,env:{NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',GOOGLE_CLIENT_ID:'test-client'},googleClient:verifier}));agent=request.agent(app);});
afterEach(()=>db.close());
async function csrf(a=agent){return (await a.get('/api/auth/csrf').expect(200)).body.csrfToken;}
async function googleLogin(a=agent){const c=await csrf(a);return a.post('/api/auth/google').set('x-csrf-token',c).send({credential:valid});}
function admin(){const now=new Date().toISOString(),password='a-unique-test-password-at-least-14';db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at) VALUES('admin-1','admin@example.com',?,'Admin','admin','active',?,?)").run(bcrypt.hashSync(password,4),now,now);return password;}
test('Google sign-in creates customer only after server token verification',async()=>{const r=await googleLogin().expect(200);assert.equal(r.body.user.role,'user');assert.equal(r.body.user.email,'member@example.com');assert.ok(r.body.csrfToken);assert.equal(db.prepare('SELECT google_sub FROM users WHERE email=?').get('member@example.com').google_sub,'google-sub-1');});
test('Google login rejects invalid ID token',async()=>{const c=await csrf();const r=await agent.post('/api/auth/google').set('x-csrf-token',c).send({credential:'not-a-valid-google-token-long-enough'}).expect(401);assert.equal(r.body.error.code,'GOOGLE_SIGN_IN_FAILED');});
test('state-changing endpoints require CSRF',async()=>{await csrf();const r=await agent.post('/api/auth/google').send({credential:valid}).expect(403);assert.equal(r.body.error.code,'CSRF_VALIDATION_FAILED');});
test('customer session cannot access administrator API',async()=>{await googleLogin().expect(200);const r=await agent.get('/api/admin/stats').expect(403);assert.equal(r.body.error.code,'ADMIN_ACCESS_REQUIRED');});
test('admin session accesses live database statistics',async()=>{const p=admin(),c=await csrf();await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password:p}).expect(200);const r=await agent.get('/api/admin/stats').expect(200);assert.equal(r.body.stats.administrators,1);});
test('admin cannot demote own account',async()=>{const p=admin(),c=await csrf();await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password:p}).expect(200);const c2=await csrf();const r=await agent.patch('/api/admin/users/admin-1').set('x-csrf-token',c2).send({role:'user'}).expect(400);assert.equal(r.body.error.code,'SELF_LOCKOUT_PREVENTED');});
test('admin user list returns pagination metadata without password hashes',async()=>{const p=admin(),now=new Date().toISOString();db.prepare("INSERT INTO users(id,email,name,role,status,created_at,updated_at) VALUES('customer-1','customer@example.com','Customer','user','active',?,?)").run(now,now);const c=await csrf();await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password:p}).expect(200);const r=await agent.get('/api/admin/users?page=1&limit=10').expect(200);assert.equal(r.body.pagination.total,2);assert.ok(r.body.users.every(u=>!Object.hasOwn(u,'password_hash')));});
