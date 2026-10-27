'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const auth = $('#diaAuth');
  const app = $('.app-stage');
  const notice = $('#diaAuthNotice');
  let csrf = '';
  let busy = false;
  function message(text, success = false) { notice.textContent=text; notice.classList.toggle('success',success); notice.hidden=!text; }
  function showAuth(text) { auth.hidden=false; app.style.display='none'; if(text)message(text); }
  function showApp(successMessage='') { auth.hidden=true; app.style.display=''; document.dispatchEvent(new CustomEvent('dia:auth-success')); if(successMessage){const toast=$('#toast');toast.textContent=successMessage;toast.classList.add('is-visible');window.setTimeout(()=>toast.classList.remove('is-visible'),2800);} }
  function apiFailureMessage(response, data, method, url, fallback) {
    const requestPath = (() => {
      try { return new URL(url, window.location.href).pathname; }
      catch { return String(url).split('?')[0]; }
    })();
    const contentType = response.headers.get('content-type') || 'unknown content type';
    if (response.status === 404) {
      const apiError = data?.error;
      if (apiError?.code === 'ENDPOINT_NOT_FOUND') {
        const build = apiError.version
          ? `; ${apiError.service || 'Dia+'} v${apiError.version}${apiError.buildCommit ? ' (' + String(apiError.buildCommit).slice(0, 7) + ')' : ''}`
          : '; server build unknown';
        return `${apiError.message || 'API endpoint not found.'} [${apiError.method || method} ${apiError.path || requestPath}${build}]`;
      }
      const serverMessage = apiError?.message || data?.message;
      if (serverMessage) return `${serverMessage} [${method} ${requestPath}; HTTP 404; ${contentType}]`;
      return `API endpoint request failed: ${method} ${requestPath} returned HTTP 404 (${contentType}). Verify this page is served by the current Dia+ Express app, not a static host or stale deployment.`;
    }
    return data?.error?.message || data?.message || fallback;
  }
  function setMode(mode) {
    const signup=mode==='signup';
    $('#loginPanel').hidden=signup;$('#signupPanel').hidden=!signup;
    $('#loginTab').classList.toggle('is-active',!signup);$('#signupTab').classList.toggle('is-active',signup);
    $('#loginTab').setAttribute('aria-selected',String(!signup));$('#signupTab').setAttribute('aria-selected',String(signup));
    $('#diaAuthTitle').innerHTML=signup?'Make it<br><em>yours.</em>':'Sign in and<br><em>feel at home.</em>';
    $('#diaAuthDescription').textContent=signup?'Create your Dia+ account with any valid email address. No Google account required.':'Sign in to explore the collection, save your favorites, and keep your bag close.';
    message('');auth.dataset.mode=mode;
  }
  async function csrfToken(){const r=await fetch('/api/auth/csrf',{credentials:'same-origin'}),d=await r.json().catch(()=>({}));if(!r.ok||!d.csrfToken)throw Error(apiFailureMessage(r,d,'GET','/api/auth/csrf','Could not start a secure session. Refresh and try again.'));csrf=d.csrfToken;return csrf;}
  async function api(url,options={}){
    const method=(options.method||'GET').toUpperCase(),headers={Accept:'application/json',...(options.headers||{})};
    if(options.body)headers['Content-Type']='application/json';
    if(!['GET','HEAD','OPTIONS'].includes(method)){if(!csrf)await csrfToken();headers['X-CSRF-Token']=csrf;}
    const r=await fetch(url,{...options,method,headers,credentials:'same-origin'}),d=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(apiFailureMessage(r,d,method,url,'Authentication failed. Please try again.'));e.status=r.status;e.code=d&&d.error?d.error.code:undefined;throw e;}
    if(d.csrfToken)csrf=d.csrfToken;return d;
  }
  function setBusy(button,active,loadingText){button.disabled=active;if(active){button.dataset.originalLabel=button.innerHTML;button.textContent=loadingText;}else{button.innerHTML=button.dataset.originalLabel||button.innerHTML;delete button.dataset.originalLabel;}}
  async function submitLogin(event){
    event.preventDefault();if(busy)return;
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    if(!email||!password){message('Enter your email address and password.');return;}
    const button=$('#userLoginSubmit');busy=true;message('');setBusy(button,true,'Signing you in…');
    try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password,rememberMe:$('#rememberMe').checked})});if(d.user&&d.user.role!=='user')throw Error('Use administrator sign-in for this account.');$('#userLoginForm').reset();showApp('Welcome back to Dia+.');}
    catch(e){message(e.message||'Email or password is incorrect.');}finally{busy=false;setBusy(button,false);}
  }
  async function submitSignup(event){
    event.preventDefault();if(busy)return;
    const name=$('#signupName').value.trim().replace(/\s+/g,' '),email=$('#signupEmail').value.trim(),password=$('#signupPassword').value,confirmPassword=$('#signupConfirm').value;
    if(name.length<2){message('Enter your full name.');return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){message('Enter a valid email address.');return;}
    if(password.length<12||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)){message('Use at least 12 characters, including a letter and a number.');return;}
    if(password!==confirmPassword){message('The passwords do not match.');$('#signupConfirm').focus();return;}
    const button=$('#userSignupSubmit');busy=true;message('');setBusy(button,true,'Creating your account…');
    try{const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password,confirmPassword})});if(d.user&&d.user.role!=='user')throw Error('This account cannot be registered as a customer.');$('#userSignupForm').reset();showApp('Your account is ready. Welcome to Dia+.');}
    catch(e){message(e.message||'We could not create your account. Please try again.');}finally{busy=false;setBusy(button,false);}
  }
  async function credentialResponse(response){
    if(busy)return;busy=true;message('Verifying your Google account securely…',true);const button=$('#googleButton');button.setAttribute('aria-busy','true');
    try{const d=await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});if(d.user&&d.user.role!=='user')throw Error('Use administrator sign-in for this account.');showApp('Signed in with Google. Welcome to Dia+.');}
    catch(e){showAuth(e.message||'Google sign-in failed. Please try again.');}finally{button.removeAttribute('aria-busy');busy=false;}
  }
  function initializeGoogle(clientId){
    if(!window.google||!window.google.accounts||!window.google.accounts.id||!clientId){$('#googleButton').hidden=true;$('#googleDivider').hidden=true;$('#googleHint').hidden=false;return;}
    $('#googleButton').hidden=false;$('#googleDivider').hidden=false;$('#googleHint').hidden=true;window.google.accounts.id.initialize({client_id:clientId,callback:credentialResponse,auto_select:false,cancel_on_tap_outside:true});
    window.google.accounts.id.renderButton($('#googleButton'),{type:'standard',theme:'outline',size:'large',shape:'rectangular',text:'continue_with',width:Math.min(340,$('#googleButton').clientWidth||340),logo_alignment:'left'});
  }
  function passwordToggles(){document.querySelectorAll('[data-toggle-password]').forEach((b)=>b.addEventListener('click',()=>{const input=document.getElementById(b.dataset.togglePassword),show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'Hide':'Show';b.setAttribute('aria-label',show?'Hide password':'Show password');}));}
  async function boot(){
    $('#diaAuthYear').textContent=String(new Date().getFullYear());
    $('#loginTab').addEventListener('click',()=>setMode('login'));$('#signupTab').addEventListener('click',()=>setMode('signup'));
    $('#showSignupLink').addEventListener('click',()=>setMode('signup'));$('#showLoginLink').addEventListener('click',()=>setMode('login'));
    $('#userLoginForm').addEventListener('submit',submitLogin);$('#userSignupForm').addEventListener('submit',submitSignup);
    $('#forgotPassword').addEventListener('click',()=>message('Password recovery email is not configured yet. Please contact the Dia+ administrator to regain access.'));
    $('#userSignOut').addEventListener('click',async()=>{const button=$('#userSignOut');button.disabled=true;try{await api('/api/auth/logout',{method:'POST',body:'{}'});document.dispatchEvent(new CustomEvent('dia:auth-logout'));csrf='';await csrfToken();setMode('login');showAuth('You have signed out securely.');}catch(e){message(e.message||'Sign out failed. Please try again.');}finally{button.disabled=false;}});
    passwordToggles();
    try{
      await csrfToken();const config=await api('/api/config'),me=await fetch('/api/auth/me',{credentials:'same-origin'});
      if(me.ok){const current=await me.json();if(current.user&&current.user.role==='admin'){window.location.href='/admin';return;}showApp();}else showAuth();
      if(config.googleClientId){
        if(window.google&&window.google.accounts&&window.google.accounts.id)initializeGoogle(config.googleClientId);
        else{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.onload=()=>initializeGoogle(config.googleClientId);script.onerror=()=>{$('#googleButton').hidden=true;$('#googleDivider').hidden=true;$('#googleHint').hidden=false;};document.head.append(script);}
      }else{$('#googleButton').hidden=true;$('#googleDivider').hidden=true;$('#googleHint').hidden=false;}
    }catch{showAuth('The authentication service is unavailable. Check that the Dia+ server is running.');}
  }
  boot();
})();