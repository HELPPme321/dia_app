'use strict';
require('dotenv').config();
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { rateLimit } = require('express-rate-limit');
const { createDatabase } = require('./db');
const { PRODUCTS } = require('./products');

const ROOT = path.join(__dirname, '..');
const TTL = 7 * 24 * 60 * 60 * 1000;
const ADMIN_TTL = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const DUMMY_HASH = bcrypt.hashSync('timing-only-not-a-real-password', 10);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const emailNorm = (v) => typeof v === 'string' ? v.trim().toLowerCase() : '';
const validEmail = (v) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPassword = (v) => typeof v === 'string' && v.length >= PASSWORD_MIN_LENGTH && v.length <= 1024 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
const safeUser = (u) => u && ({ id:u.id,email:u.email,name:u.name,picture:u.picture_url||null,role:u.role,status:u.status,createdAt:u.created_at,lastLoginAt:u.last_login_at||null });
function error(res,status,code,message){ return res.status(status).json({error:{code,message}}); }
function readCookie(req,name){const c=req.headers.cookie||'';for(const p of c.split(';')){const i=p.indexOf('=');if(i>0&&p.slice(0,i).trim()===name)return p.slice(i+1).trim();}return null;}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}

function createApp(options = {}) {
  const app = express();
  const env = options.env || process.env;
  const db = options.db || createDatabase(env.DATABASE_PATH);
  const google = options.googleClient || new OAuth2Client();
  const prod = env.NODE_ENV === 'production';
  const cookieName = prod ? '__Host-dia.sid' : 'dia.sid';
  const origin = (env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/,'');
  app.disable('x-powered-by');
  app.set('trust proxy', prod ? 1 : false);
  app.use(helmet({crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'},contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],baseUri:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],
    scriptSrc:["'self'","https://accounts.google.com/gsi/client"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com","https://accounts.google.com/gsi/style"],
    fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'","https://accounts.google.com/gsi/"],frameSrc:["https://accounts.google.com/gsi/"]
  }} }));
  app.use(express.json({limit:'32kb'}));
  app.use((req,res,next)=>{
    const reqOrigin=req.get('origin');
    if(reqOrigin && reqOrigin.replace(/\/$/,'')!==origin && !SAFE.has(req.method)) return error(res,403,'ORIGIN_NOT_ALLOWED','This request origin is not allowed.');
    if(reqOrigin && reqOrigin.replace(/\/$/,'')!==origin && req.method==='OPTIONS') return error(res,403,'ORIGIN_NOT_ALLOWED','This request origin is not allowed.');
    if(req.method==='OPTIONS') return res.status(204).end();
    next();
  });
  app.use((req,res,next)=>{
    const raw=readCookie(req,cookieName), tokenHash=raw?hash(raw):null;
    let s=tokenHash?db.prepare("SELECT s.*,u.email,u.name,u.picture_url,u.role,u.status,u.created_at,u.last_login_at FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").get(tokenHash):null;
    if(s && s.expires_at<=Date.now()){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);s=null;}
    if(s && s.user_id && s.status!=='active'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);s=null;res.clearCookie(cookieName,{httpOnly:true,secure:prod,sameSite:'lax',path:'/'});}
    req.session=s||null; req.tokenHash=s?tokenHash:null;
    req.user=s&&s.user_id?{id:s.user_id,email:s.email,name:s.name,picture_url:s.picture_url,role:s.role,status:s.status,created_at:s.created_at,last_login_at:s.last_login_at}:null;
    next();
  });
  function setCookie(res,t,age){res.cookie(cookieName,t,{httpOnly:true,secure:prod,sameSite:'lax',path:'/',maxAge:age,priority:'high'});}
  function startSession(req,res,userId,age,method){
    if(req.tokenHash)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.tokenHash);
    const raw=token(), tokenHash=hash(raw), csrf=token(), now=Date.now();
    db.prepare('INSERT INTO sessions(token_hash,user_id,csrf_token,auth_method,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(tokenHash,userId||null,csrf,method,now,now,now+age);
    setCookie(res,raw,age);return csrf;
  }
  function csrf(req,res,next){if(!req.session||!safeEqual(req.get('x-csrf-token'),req.session.csrf_token))return error(res,403,'CSRF_VALIDATION_FAILED','Refresh the page and try again.');next();}
  function auth(req,res,next){if(!req.user)return error(res,401,'AUTHENTICATION_REQUIRED','Please sign in to continue.');if(req.user.status!=='active')return error(res,403,'ACCOUNT_DISABLED','This account is disabled.');next();}
  function admin(req,res,next){if(!req.user)return error(res,401,'AUTHENTICATION_REQUIRED','Administrator sign-in is required.');if(req.user.role!=='admin'||req.user.status!=='active'||req.session?.auth_method!=='admin')return error(res,403,'ADMIN_ACCESS_REQUIRED','Administrator password sign-in is required.');next();}
  const limiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'TOO_MANY_ATTEMPTS',message:'Too many sign-in attempts. Please wait before trying again.'}}});
  const registrationLimiter=rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'REGISTRATION_RATE_LIMITED',message:'Too many registration attempts. Please wait and try again.'}}});
  app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/api/config',(_req,res)=>res.json({googleClientId:env.GOOGLE_CLIENT_ID||''}));
  app.get('/api/auth/csrf',(req,res)=>{db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());if(req.session)return res.json({csrfToken:req.session.csrf_token});return res.json({csrfToken:startSession(req,res,null,TTL,'anonymous')});});
  app.get('/api/auth/me',(req,res)=>req.user?res.json({authenticated:true,user:safeUser(req.user),authMethod:req.session.auth_method}):res.status(401).json({authenticated:false,user:null,authMethod:null}));
  app.get('/api/products',(_req,res)=>res.json({products:PRODUCTS}));
  app.get('/api/profile',auth,(req,res)=>res.json({user:safeUser(req.user)}));
  app.post('/api/auth/register',registrationLimiter,csrf,async(req,res)=>{
    const name=typeof req.body?.name==='string'?req.body.name.trim().replace(/\s+/g,' '):'';
    const email=emailNorm(req.body?.email),password=req.body?.password,confirmPassword=req.body?.confirmPassword;
    if(name.length<2||name.length>120||/[\u0000-\u001f\u007f]/.test(name))return error(res,400,'INVALID_NAME','Enter your full name.');
    if(!validEmail(email))return error(res,400,'INVALID_EMAIL','Enter a valid email address.');
    if(!validPassword(password))return error(res,400,'WEAK_PASSWORD','Use at least 12 characters, including a letter and a number.');
    if(password!==confirmPassword)return error(res,400,'PASSWORD_MISMATCH','The passwords do not match.');
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return error(res,409,'EMAIL_ALREADY_REGISTERED','An account already uses this email. Sign in or use a different address.');
    const now=new Date().toISOString(),id=crypto.randomUUID();
    try{
      const passwordHash=await bcrypt.hash(password,12);
      db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at,last_login_at) VALUES(?,?,?,?,'user','active',?,?,?)").run(id,email,passwordHash,name,now,now,now);
      const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
      const csrfToken=startSession(req,res,id,DAY,'password');
      return res.status(201).json({authenticated:true,user:safeUser(user),csrfToken});
    }catch(e){
      if(e&&e.code&&String(e.code).startsWith('SQLITE_CONSTRAINT'))return error(res,409,'EMAIL_ALREADY_REGISTERED','An account already uses this email. Sign in or use a different address.');
      return error(res,500,'REGISTRATION_FAILED','We could not create your account. Please try again.');
    }
  });
  app.post('/api/auth/login',limiter,csrf,async(req,res)=>{
    const email=emailNorm(req.body?.email),password=req.body?.password;
    if(!validEmail(email)||typeof password!=='string'||password.length>1024)return error(res,400,'INVALID_INPUT','Enter your email address and password.');
    const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    let ok=false;try{ok=await bcrypt.compare(password,u?.password_hash||DUMMY_HASH);}catch{}
    if(!u||u.role!=='user'||u.status!=='active'||!u.password_hash||!ok)return error(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
    const now=new Date().toISOString();db.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').run(now,now,u.id);
    const remember=req.body?.rememberMe===true,csrfToken=startSession(req,res,u.id,remember?30*DAY:DAY,'password');
    return res.json({authenticated:true,user:safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)),csrfToken});
  });
  app.post('/api/auth/google',limiter,csrf,async(req,res)=>{
    try{
      const credential=req.body?.credential;
      if(typeof credential!=='string'||credential.length<40||credential.length>20000)return error(res,400,'INVALID_CREDENTIAL','Google did not return a valid sign-in credential.');
      if(!env.GOOGLE_CLIENT_ID)return error(res,503,'GOOGLE_NOT_CONFIGURED','Google sign-in is not configured on this server yet.');
      const ticket=await google.verifyIdToken({idToken:credential,audience:env.GOOGLE_CLIENT_ID});
      const p=ticket?.getPayload?.();
      if(!p?.sub||!p.email||p.email_verified!==true)return error(res,401,'GOOGLE_IDENTITY_NOT_VERIFIED','Google could not verify this account.');
      const email=emailNorm(p.email);if(!validEmail(email))return error(res,401,'GOOGLE_EMAIL_INVALID','Google returned an invalid email address.');
      let u=db.prepare('SELECT * FROM users WHERE google_sub=?').get(p.sub);
      if(!u){
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return error(res,409,'ACCOUNT_LINK_REQUIRED','An account already uses this email. Contact support to link accounts safely.');
        const now=new Date().toISOString(),id=crypto.randomUUID();
        db.prepare("INSERT INTO users(id,email,google_sub,name,picture_url,role,status,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,'user','active',?,?,?)")
          .run(id,email,p.sub,String(p.name||email.split('@')[0]).slice(0,120),typeof p.picture==='string'?p.picture.slice(0,2048):null,now,now,now);
        u=db.prepare('SELECT * FROM users WHERE id=?').get(id);
      } else {
        if(u.role==='admin')return error(res,403,'USE_ADMIN_LOGIN','Use administrator sign-in for this account.');
        if(u.status!=='active')return error(res,403,'ACCOUNT_DISABLED','This account is disabled.');
        const now=new Date().toISOString();
        db.prepare('UPDATE users SET email=?,name=?,picture_url=?,updated_at=?,last_login_at=? WHERE id=?').run(email,String(p.name||u.name).slice(0,120),typeof p.picture==='string'?p.picture.slice(0,2048):u.picture_url,now,now,u.id);
        u=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
      }
      if(u.status!=='active')return error(res,403,'ACCOUNT_DISABLED','This account is disabled.');
      const csrfToken=startSession(req,res,u.id,TTL,'google');
      return res.json({authenticated:true,user:safeUser(u),csrfToken});
    }catch{return error(res,401,'GOOGLE_SIGN_IN_FAILED','Google sign-in failed. Please try again.');}
  });
  app.post('/api/auth/admin-login',limiter,csrf,async(req,res)=>{
    const email=emailNorm(req.body?.email), password=req.body?.password;
    if(!validEmail(email)||typeof password!=='string'||password.length>1024)return error(res,400,'INVALID_INPUT','Enter a valid email and password.');
    const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    let ok=false;try{ok=await bcrypt.compare(password,u?.password_hash||DUMMY_HASH);}catch{}
    if(!u||u.role!=='admin'||u.status!=='active'||!u.password_hash||!ok)return error(res,401,'INVALID_ADMIN_CREDENTIALS','The email or password is incorrect.');
    const now=new Date().toISOString();db.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').run(now,now,u.id);
    const csrfToken=startSession(req,res,u.id,ADMIN_TTL,'admin');
    return res.json({authenticated:true,user:safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)),csrfToken});
  });
  app.post('/api/auth/logout',csrf,(req,res)=>{if(req.tokenHash)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.tokenHash);res.clearCookie(cookieName,{httpOnly:true,secure:prod,sameSite:'lax',path:'/'});res.json({ok:true});});
  app.get('/api/admin/stats',auth,admin,(_req,res)=>{
    const week=new Date(Date.now()-7*86400000).toISOString(),now=Date.now();
    res.json({stats:{totalUsers:db.prepare("SELECT COUNT(*) count FROM users WHERE role='user'").get().count,activeUsers:db.prepare("SELECT COUNT(*) count FROM users WHERE role='user' AND status='active'").get().count,administrators:db.prepare("SELECT COUNT(*) count FROM users WHERE role='admin' AND status='active'").get().count,newUsersThisWeek:db.prepare("SELECT COUNT(*) count FROM users WHERE role='user' AND created_at>=?").get(week).count,activeSessions:db.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id IS NOT NULL AND expires_at>?').get(now).count}});
  });
  app.get('/api/admin/users',auth,admin,(req,res)=>{
    const page=Math.max(1,Number.parseInt(req.query.page,10)||1),limit=Math.max(1,Math.min(50,Number.parseInt(req.query.limit,10)||10));
    const search=typeof req.query.search==='string'?req.query.search.trim().slice(0,80):'';
    const role=['user','admin'].includes(req.query.role)?req.query.role:'',status=['active','disabled'].includes(req.query.status)?req.query.status:'';
    const clauses=[],params=[];if(search){clauses.push("(email LIKE ? OR name LIKE ?)");params.push('%'+search+'%','%'+search+'%');}
    if(role){clauses.push('role=?');params.push(role);}if(status){clauses.push('status=?');params.push(status);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=db.prepare('SELECT COUNT(*) count FROM users'+where).get(...params).count;
    const users=db.prepare('SELECT id,email,name,picture_url,role,status,created_at,last_login_at FROM users'+where+' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params,limit,(page-1)*limit);
    res.json({users:users.map(safeUser),pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
  });
  app.patch('/api/admin/users/:id',csrf,auth,admin,async(req,res)=>{
    const id=String(req.params.id).slice(0,80),body=req.body||{},changes={};
    if(Object.hasOwn(body,'role')){if(!['user','admin'].includes(body.role))return error(res,400,'INVALID_ROLE','Choose a valid role.');changes.role=body.role;}
    if(Object.hasOwn(body,'status')){if(!['active','disabled'].includes(body.status))return error(res,400,'INVALID_STATUS','Choose a valid status.');changes.status=body.status;}
    if(!Object.keys(changes).length)return error(res,400,'NO_CHANGES','No valid account changes were provided.');
    const target=db.prepare('SELECT id,role,status FROM users WHERE id=?').get(id);if(!target)return error(res,404,'USER_NOT_FOUND','That account was not found.');
    const promotion=changes.role==='admin'&&target.role!=='admin';let passwordHash=null;
    if(promotion){if(typeof body.adminPassword!=='string'||body.adminPassword.length<14||body.adminPassword.length>1024)return error(res,400,'ADMIN_PASSWORD_REQUIRED','Promotion requires a new admin password of at least 14 characters.');passwordHash=await bcrypt.hash(body.adminPassword,12);}
    else if(Object.hasOwn(body,'adminPassword'))return error(res,400,'UNEXPECTED_ADMIN_PASSWORD','A password is only accepted when promoting an account.');
    if(target.id===req.user.id&&((changes.role&&changes.role!=='admin')||changes.status==='disabled'))return error(res,400,'SELF_LOCKOUT_PREVENTED','You cannot remove your own administrator access.');
    if(target.role==='admin'&&target.status==='active'&&((changes.role&&changes.role!=='admin')||changes.status==='disabled')&&db.prepare("SELECT COUNT(*) count FROM users WHERE role='admin' AND status='active'").get().count<=1)return error(res,409,'LAST_ADMIN_PROTECTED','At least one active administrator must remain.');
    const sets=[],values=[];for(const [k,v] of Object.entries(changes)){sets.push(k+'=?');values.push(v);}if(passwordHash){sets.push('password_hash=?');values.push(passwordHash);}sets.push('updated_at=?');values.push(new Date().toISOString(),id);
    db.prepare('UPDATE users SET '+sets.join(',')+' WHERE id=?').run(...values);
    res.json({user:safeUser(db.prepare('SELECT id,email,name,picture_url,role,status,created_at,last_login_at FROM users WHERE id=?').get(id))});
  });
  app.get('/admin',(_req,res)=>res.sendFile(path.join(ROOT,'admin.html')));
  app.get('/',(_req,res)=>res.sendFile(path.join(ROOT,'index.html')));
  for(const file of ['index.html','style.css','script.js','auth.js','admin.html','admin.css','admin.js']){
    app.get('/'+file,(_req,res)=>res.sendFile(path.join(ROOT,file)));
  }
  app.use('/assets',express.static(path.join(ROOT,'assets'),{dotfiles:'deny',index:false}));
  app.use('/api',(_req,res)=>error(res,404,'ENDPOINT_NOT_FOUND','The requested API endpoint was not found.'));
  app.use((_req,res)=>res.status(404).type('text/plain').send('Not found'));
  app.use((err,_req,res,_next)=>{if(res.headersSent)return;res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.'}});});
  return {app,db};
}
if(require.main===module){const {app}=createApp();const port=Number.parseInt(process.env.PORT,10)||3000;app.listen(port,()=>{console.log('Dia+ running on http://localhost:'+port);if(!process.env.GOOGLE_CLIENT_ID)console.warn('Configure GOOGLE_CLIENT_ID in .env to enable Google sign-in.');});}
module.exports={createApp,safeUser};
