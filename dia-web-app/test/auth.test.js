'use strict';
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const bcrypt=require('bcryptjs');
const {createDatabase}=require('../src/db');
const {createApp}=require('../src/server');
const {provisionAdmin}=require('../scripts/provision-admin');

let db,agent,app;
const valid='valid-google-id-token-sentinel-for-a-mocked-verifier';
const verifier={async verifyIdToken({idToken,audience}){if(audience!=='test-client'||idToken!==valid)throw Error('bad token');return{getPayload:()=>({sub:'google-sub-1',email:'member@example.com',email_verified:true,name:'Dia Member',picture:'https://example.com/avatar.png'})};}};
beforeEach(()=>{db=createDatabase(':memory:');({app}=createApp({db,env:{NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',GOOGLE_CLIENT_ID:'test-client'},googleClient:verifier}));agent=request.agent(app);});
afterEach(()=>db.close());
async function csrf(a=agent){return(await a.get('/api/auth/csrf').expect(200)).body.csrfToken;}
function admin(){const now=new Date().toISOString(),password='a-unique-test-password-at-least-14';db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at) VALUES('admin-1','admin@example.com',?,'Admin','admin','active',?,?)").run(bcrypt.hashSync(password,4),now,now);return password;}
async function register(a,email='member@example.net',password='A-strong-password-123'){const c=await csrf(a);return a.post('/api/auth/register').set('x-csrf-token',c).send({name:'Dia Customer',email,password,confirmPassword:password});}
async function login(a,email='member@example.net',password='A-strong-password-123',rememberMe=false){const c=await csrf(a);return a.post('/api/auth/login').set('x-csrf-token',c).send({email,password,rememberMe});}

test('standard registration creates a hashed customer account without Google',async()=>{
  const r=await register(agent,'Person@Example.net');assert.equal(r.status,201);
  assert.equal(r.body.user.role,'user');assert.equal(r.body.user.email,'person@example.net');assert.ok(r.body.csrfToken);
  const saved=db.prepare('SELECT password_hash,google_sub,role FROM users WHERE email=?').get('person@example.net');
  assert.notEqual(saved.password_hash,'A-strong-password-123');assert.ok(saved.password_hash.startsWith('$2'));assert.equal(saved.google_sub,null);assert.equal(saved.role,'user');
  await agent.get('/api/auth/me').expect(200);
});
test('registration normalizes email and prevents duplicate accounts',async()=>{
  assert.equal((await register(agent,'Person@Example.net')).status,201);
  const r=await register(agent,' person@example.NET ');assert.equal(r.status,409);
  assert.equal(r.body.error.code,'EMAIL_ALREADY_REGISTERED');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count,1);
});
test('registration rejects weak or mismatched passwords',async()=>{
  const c=await csrf();
  await agent.post('/api/auth/register').set('x-csrf-token',c).send({name:'Dia Customer',email:'weak@example.net',password:'short1',confirmPassword:'short1'}).expect(400);
  const c2=await csrf();
  const r=await agent.post('/api/auth/register').set('x-csrf-token',c2).send({name:'Dia Customer',email:'mismatch@example.net',password:'A-strong-password-123',confirmPassword:'A-different-password-456'}).expect(400);
  assert.equal(r.body.error.code,'PASSWORD_MISMATCH');
});
test('customer can log in with email and password and session persists',async()=>{
  assert.equal((await register(agent)).status,201);
  const browser=request.agent(app);
  const r=await login(browser);assert.equal(r.status,200);
  assert.equal(r.body.user.role,'user');assert.equal(r.body.user.email,'member@example.net');
  const profile=await browser.get('/api/profile').expect(200);assert.equal(profile.body.user.email,'member@example.net');
  assert.equal((await browser.get('/api/auth/me').expect(200)).body.authenticated,true);
});
test('invalid customer credentials produce a generic error',async()=>{
  assert.equal((await register(agent)).status,201);
  const browser=request.agent(app);
  const r=await login(browser,'member@example.net','wrong-password-123');assert.equal(r.status,401);
  assert.equal(r.body.error.code,'INVALID_CREDENTIALS');assert.equal(r.body.error.message,'Email or password is incorrect.');
});
test('logout invalidates the customer session',async()=>{
  assert.equal((await register(agent)).status,201);
  await agent.get('/api/profile').expect(200);
  const c=await csrf();
  await agent.post('/api/auth/logout').set('x-csrf-token',c).send({}).expect(200);
  await agent.get('/api/profile').expect(401);
});
test('Google sign-in creates a customer only after server token verification',async()=>{
  const c=await csrf();
  const r=await agent.post('/api/auth/google').set('x-csrf-token',c).send({credential:valid}).expect(200);
  assert.equal(r.body.user.role,'user');assert.equal(r.body.user.email,'member@example.com');assert.ok(r.body.csrfToken);
  assert.equal(db.prepare('SELECT google_sub FROM users WHERE email=?').get('member@example.com').google_sub,'google-sub-1');
});
test('Google login rejects an invalid ID token',async()=>{
  const c=await csrf();
  const r=await agent.post('/api/auth/google').set('x-csrf-token',c).send({credential:'this-is-definitely-not-a-valid-google-token-and-is-long-enough'}).expect(401);
  assert.equal(r.body.error.code,'GOOGLE_SIGN_IN_FAILED');
});
test('state-changing authentication endpoints require CSRF',async()=>{
  await csrf();
  const r=await agent.post('/api/auth/register').send({name:'No CSRF',email:'no-csrf@example.net',password:'A-strong-password-123',confirmPassword:'A-strong-password-123'}).expect(403);
  assert.equal(r.body.error.code,'CSRF_VALIDATION_FAILED');
});
test('customer session cannot access administrator API',async()=>{
  assert.equal((await register(agent)).status,201);
  const r=await agent.get('/api/admin/stats').expect(403);
  assert.equal(r.body.error.code,'ADMIN_ACCESS_REQUIRED');
});
test('admin provisioning repairs an existing account and enables the protected dashboard',async()=>{
  assert.equal((await register(agent,'admin.candidate@example.net','A-customer-password-123')).status,201);
  await agent.get('/api/profile').expect(200);
  const previousSessions=db.prepare("SELECT COUNT(*) count FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)").get('admin.candidate@example.net').count;
  assert.ok(previousSessions>0);

  const password='A-new-admin-password-2026';
  const result=await provisionAdmin({
    db,
    env:{ADMIN_EMAIL:' Admin.Candidate@Example.NET ',ADMIN_PASSWORD:password,DATABASE_PATH:':memory:'},
    logger:{log(){}}
  });
  assert.equal(result.created,false);
  const saved=db.prepare('SELECT role,status,password_hash,is_demo FROM users WHERE email=?').get('admin.candidate@example.net');
  assert.equal(saved.role,'admin');
  assert.equal(saved.status,'active');
  assert.equal(saved.is_demo,0);
  assert.notEqual(saved.password_hash,password);
  assert.equal(await bcrypt.compare(password,saved.password_hash),true);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)").get('admin.candidate@example.net').count,0);

  const adminBrowser=request.agent(app);
  const c=await csrf(adminBrowser);
  const response=await adminBrowser.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin.candidate@example.net',password}).expect(200);
  assert.equal(response.body.user.role,'admin');
  assert.equal(response.body.authenticated,true);
  const me=await adminBrowser.get('/api/auth/me').expect(200);
  assert.equal(me.body.authMethod,'admin');
  await adminBrowser.get('/admin').expect(200);
  const stats=await adminBrowser.get('/api/admin/stats').expect(200);
  assert.equal(stats.body.stats.administrators,1);
});

test('a signed-in customer cannot open the admin page',async()=>{
  assert.equal((await register(agent,'store.customer@example.net')).status,201);
  await agent.get('/admin').expect(403);
  const stats=await agent.get('/api/admin/stats').expect(403);
  assert.equal(stats.body.error.code,'ADMIN_ACCESS_REQUIRED');
});

test('admin session accesses live database statistics',async()=>{
  const password=admin(),c=await csrf();
  await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password}).expect(200);
  const r=await agent.get('/api/admin/stats').expect(200);assert.equal(r.body.stats.administrators,1);
});
test('promoting a customer to admin revokes their existing customer session',async()=>{
  const adminPassword=admin(),now=new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at) VALUES('promoted-1','promoted@example.com',?,'Promoted','user','active',?,?)")
    .run(bcrypt.hashSync('Customer-Password-2026',4),now,now);
  const customerBrowser=request.agent(app);
  const customerCsrf=await csrf(customerBrowser);
  await customerBrowser.post('/api/auth/login').set('x-csrf-token',customerCsrf).send({email:'promoted@example.com',password:'Customer-Password-2026'}).expect(200);
  await customerBrowser.get('/api/profile').expect(200);

  const adminCsrf=await csrf(agent);
  await agent.post('/api/auth/admin-login').set('x-csrf-token',adminCsrf).send({email:'admin@example.com',password:adminPassword}).expect(200);
  const password='A-promoted-admin-password-2026';
  const promoteCsrf=await csrf(agent);
  await agent.patch('/api/admin/users/promoted-1').set('x-csrf-token',promoteCsrf)
    .send({role:'admin',adminPassword:password}).expect(200);

  await customerBrowser.get('/api/profile').expect(401);
  const adminPage=await customerBrowser.get('/admin').expect(200);
  assert.match(adminPage.text,/id="adminLogin"/);
  const nextCsrf=await csrf(customerBrowser);
  const adminLogin=await customerBrowser.post('/api/auth/admin-login').set('x-csrf-token',nextCsrf)
    .send({email:'promoted@example.com',password}).expect(200);
  assert.equal(adminLogin.body.user.role,'admin');
  assert.equal((await customerBrowser.get('/api/admin/stats').expect(200)).body.stats.administrators,2);
});

test('admin cannot demote own account',async()=>{
  const password=admin(),c=await csrf();
  await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password}).expect(200);
  const c2=await csrf();
  const r=await agent.patch('/api/admin/users/admin-1').set('x-csrf-token',c2).send({role:'user'}).expect(400);
  assert.equal(r.body.error.code,'SELF_LOCKOUT_PREVENTED');
});
test('admin user list returns pagination metadata without password hashes',async()=>{
  const password=admin(),now=new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,name,role,status,created_at,updated_at) VALUES('customer-1','customer@example.com','Customer','user','active',?,?)").run(now,now);
  const c=await csrf();await agent.post('/api/auth/admin-login').set('x-csrf-token',c).send({email:'admin@example.com',password}).expect(200);
  const r=await agent.get('/api/admin/users?page=1&limit=10').expect(200);
  assert.equal(r.body.pagination.total,2);assert.ok(r.body.users.every(u=>!Object.hasOwn(u,'password_hash')));
});
test('normal password login cannot be used for administrator accounts',async()=>{
  const password=admin(),c=await csrf();
  const r=await agent.post('/api/auth/login').set('x-csrf-token',c).send({email:'admin@example.com',password}).expect(401);
  assert.equal(r.body.error.code,'INVALID_CREDENTIALS');
});

test('static server does not expose backend source or package metadata',async()=>{
  await agent.get('/src/server.js').expect(404);
  await agent.get('/package.json').expect(404);
  await agent.get('/.env.example').expect(404);
});
