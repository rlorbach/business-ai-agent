// Simple finite-state chat widget implementing the provided flowchart
(function(){
  const widget = document.getElementById('chat-widget');
  const toggle = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const messages = document.getElementById('messages');
  const controls = document.getElementById('controls');

  const TIMEOUT_MS = 30000; // 30 second timeout for backend calls

  let state = 'start';

  function open(){widget.classList.remove('chat-closed');panel.setAttribute('aria-hidden','false');}
  function close(){widget.classList.add('chat-closed');panel.setAttribute('aria-hidden','true');}

  toggle.addEventListener('click', ()=>{
    if(widget.classList.contains('chat-closed')){open(); if(state==='start') runStart();}
    else close();
  });

  function pushAgent(text){
    const el = document.createElement('div'); el.className='msg agent'; el.innerText = text; messages.appendChild(el); messages.scrollTop = messages.scrollHeight;
  }
  function pushUser(text){
    const el = document.createElement('div'); el.className='msg user'; el.innerText = text; messages.appendChild(el); messages.scrollTop = messages.scrollHeight;
  }

  // helpers to render control buttons and input
  function setControls(nodes){ controls.innerHTML=''; nodes.forEach(n=>controls.appendChild(n)); }

  function makeBtn(label, cls, cb){ const b=document.createElement('button'); b.className = 'btn '+(cls||''); b.type='button'; b.innerText = label; b.addEventListener('click', cb); return b; }
  function makeInput(placeholder, onSubmit){ const inp=document.createElement('input'); inp.className='input'; inp.placeholder=placeholder; inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && inp.value.trim()){ onSubmit(inp.value.trim()); inp.value=''; }}); return inp; }

  // Flow implementation
  function runStart(){ state='start'; pushAgent('Hi — are you interested in website improvements or AI efficiencies?');
    const b1 = makeBtn('Website','', ()=>{ pushUser('Website'); runWebsiteStep1(); });
    const b2 = makeBtn('AI','', ()=>{ pushUser('AI'); runAIStep1(); });
    const b3 = makeBtn('Something else','', ()=>{ pushUser('Something else'); window.open('https://lorbachdigital.com/contact/', '_blank'); pushAgent('Opening contact page...'); });
    setControls([b1,b2,b3]);
  }

  // Website path
  function runWebsiteStep1(){ state='website_age'; pushAgent('How long has it been since your website was built?');
    const choices=['Never','10+ years','5-10 years','1-5 years'];
    const nodes = choices.map(c=> makeBtn(c,'', ()=>{ pushUser(c); runWebsiteImprovements(c); }));
    setControls(nodes);
  }

  function runWebsiteImprovements(choice, retryCount = 0){ state='website_improvements';
    // If a server proxy is available (see README), call it for richer responses.
    const useBackend = !!window.USE_LLM;
    if (!useBackend) {
      const msg = {
        'Never': 'Since you don\'t have a site yet, I recommend: modern responsive design, search engine friendly structure, visitor analytics, and easy content management.',
        '10+ years': 'Older sites often need: mobile-friendly redesign, updated security, faster loading speeds, and modern design standards.',
        '5-10 years': 'Consider: performance improvements, better mobile experience, content updates, and modern search optimization.',
        '1-5 years': 'Likely a good base — suggest: conversion testing, visitor engagement improvements, and ongoing performance monitoring.'
      }[choice] || 'Recommended improvements: responsive layout, security, and analytics.';
      pushAgent(msg);
      setTimeout(()=>{ pushAgent('Would you like us to contact you to get started?'); const yes = makeBtn('Yes','primary', ()=>{ pushUser('Yes'); window.open('https://lorbachdigital.com/contact/', '_blank'); pushAgent('Opening contact page...'); }); const no = makeBtn('No','', ()=>{ pushUser('No'); pushAgent('No problem — feel free to re-open this chat anytime.'); setControls([]); }); const restart = makeBtn('Start Over','', ()=>{ messages.innerHTML=''; setControls([]); runStart(); }); setControls([yes,no,restart]); }, 350);
      return;
    }

    // backend-enabled path — request a tailored answer from server (streamed)
    const loadingMsg = retryCount > 0 ? 'Retrying...' : 'Generating tailored recommendations...';
    pushAgent(loadingMsg);
    (async ()=>{
      const prompt = `Provide 6 concise technical improvements for a website that is ${choice}. Present them as numbered bullet points.`;
      const el = createAgentStreamMessage(); let buffer = '';
      try {
        const stream = await callLLMStream(prompt, (chunk)=>{ buffer += chunk; el.innerText = buffer; messages.scrollTop = messages.scrollHeight; });
        await stream.finished;
        setTimeout(()=>{ pushAgent('Would you like us to contact you to get started?'); const yes = makeBtn('Yes','primary', ()=>{ pushUser('Yes'); window.open('https://lorbachdigital.com/contact/', '_blank'); pushAgent('Opening contact page...'); }); const no = makeBtn('No','', ()=>{ pushUser('No'); pushAgent('No problem — feel free to re-open this chat anytime.'); setControls([]); }); const restart = makeBtn('Start Over','', ()=>{ messages.innerHTML=''; setControls([]); runStart(); }); setControls([yes,no,restart]); }, 350);
      } catch (err){ 
        console.error('Backend error:', err);
        el.remove(); // Remove the empty streaming message
        if (retryCount < 2) {
          pushAgent(`Connection issue. Let me try again...`);
          const retry = makeBtn('Try Again Now', 'primary', ()=>{ setControls([]); runWebsiteImprovements(choice, retryCount + 1); });
          const fallback = makeBtn('Show Default Results', '', ()=>{ setControls([]); window.USE_LLM = false; runWebsiteImprovements(choice); });
          setControls([retry, fallback]);
        } else {
          pushAgent('Unable to connect to backend. Showing default recommendations.');
          window.USE_LLM = false; 
          runWebsiteImprovements(choice);
        }
      }
    })();
  }

  // AI path
  function runAIStep1(){ state='ai_business'; pushAgent('Great — what type of business are you in? (e.g., ecommerce, services, healthcare)');
    const inp = makeInput('Type your business (press Enter)', (val)=>{ pushUser(val); runAIBenefits(val); });
    setControls([inp]); inp.focus();
  }

  function runAIBenefits(btype, retryCount = 0){ state='ai_benefits';
    const useBackend = !!window.USE_LLM;
    if (!useBackend) {
      const key = btype.toLowerCase();
      let benefits = ['Automation of repetitive tasks','Personalized customer experiences','Improved data-driven decisions'];
      if(key.includes('ecom')||key.includes('shop')) benefits = ['Product recommendations to increase AOV','Automated inventory forecasting','Personalized marketing campaigns'];
      else if(key.includes('service')) benefits = ['Automated scheduling and reminders','Lead scoring to prioritize outreach','Chat assistants to handle FAQs'];
      else if(key.includes('health')||key.includes('clinic')) benefits = ['Patient triage assistants','Appointment scheduling automation','Secure data handling & insights'];
      pushAgent('Here are benefits for '+btype+':');
      pushAgent(benefits.map((b,i)=>`${i+1}. ${b}`).join('\n'));
      setTimeout(()=>{ pushAgent('Would you like us to contact you to get started?'); const yes = makeBtn('Yes','primary', ()=>{ pushUser('Yes'); window.open('https://lorbachdigital.com/contact/', '_blank'); pushAgent('Opening contact page...'); }); const no = makeBtn('No','', ()=>{ pushUser('No'); pushAgent('Alright — close the chat and reach out anytime.'); setControls([]); }); const restart = makeBtn('Start Over','', ()=>{ messages.innerHTML=''; setControls([]); runStart(); }); setControls([yes,no,restart]); }, 350);
      return;
    }

    // backend-enabled path — request tailored benefits
    const loadingMsg = retryCount > 0 ? 'Retrying...' : 'Fetching tailored benefits...';
    pushAgent(loadingMsg);
    (async ()=>{
      const prompt = `List 6 concise benefits of using AI for a ${btype} business, formatted as numbered bullet points.`;
      const el = createAgentStreamMessage(); let buffer = '';
      try {
        const stream = await callLLMStream(prompt, (chunk)=>{ buffer += chunk; el.innerText = buffer; messages.scrollTop = messages.scrollHeight; });
        await stream.finished;
        setTimeout(()=>{ pushAgent('Would you like us to contact you to get started?'); const yes = makeBtn('Yes','primary', ()=>{ pushUser('Yes'); window.open('https://lorbachdigital.com/contact/', '_blank'); pushAgent('Opening contact page...'); }); const no = makeBtn('No','', ()=>{ pushUser('No'); pushAgent('Alright — close the chat and reach out anytime.'); setControls([]); }); const restart = makeBtn('Start Over','', ()=>{ messages.innerHTML=''; setControls([]); runStart(); }); setControls([yes,no,restart]); }, 350);
      } catch (err){ 
        console.error('Backend error:', err);
        el.remove(); // Remove the empty streaming message
        if (retryCount < 2) {
          pushAgent(`Connection issue. Let me try again...`);
          const retry = makeBtn('Try Again Now', 'primary', ()=>{ setControls([]); runAIBenefits(btype, retryCount + 1); });
          const fallback = makeBtn('Show Default Results', '', ()=>{ setControls([]); window.USE_LLM = false; runAIBenefits(btype); });
          setControls([retry, fallback]);
        } else {
          pushAgent('Unable to connect to backend. Showing default recommendations.');
          window.USE_LLM = false; 
          runAIBenefits(btype);
        }
      }
    })();
  }

  // call the backend proxy for LLM responses
  async function callLLM(prompt){
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt })
    });
    if(!res.ok) throw new Error('LLM proxy error: '+res.status);
    const j = await res.json();
    return j.assistant || JSON.stringify(j);
  }

  // Streaming call to backend proxy; returns a function to cancel the stream
  async function callLLMStream(prompt, onChunk){
    return Promise.race([
      callLLMStreamInternal(prompt, onChunk),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS))
    ]);
  }

  // Internal streaming implementation
  async function callLLMStreamInternal(prompt, onChunk){
    // Get backend URL from config or default to same origin
    const backendBaseUrl = (window.CHAT_BACKEND_URL || '').replace(/\/$/, ''); // Remove trailing slash
    
    // If WebSocket forwarding enabled, use WS for lower latency
    if (window.USE_WS && window.PROXY_TOKEN){
      const wsProtocol = (backendBaseUrl.startsWith('https') || location.protocol === 'https:') ? 'wss:' : 'ws:';
      const wsHost = backendBaseUrl ? backendBaseUrl.replace(/^https?:\/\//, '') : location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(window.PROXY_TOKEN)}`;
      const ws = new WebSocket(wsUrl);
      let finishedResolve;
      const finished = new Promise(r=>{ finishedResolve = r; });
      ws.addEventListener('open', ()=>{
        ws.send(JSON.stringify({ prompt }));
      });
      ws.addEventListener('message', (ev)=>{
        try {
          const d = JSON.parse(ev.data);
          if (d.type === 'delta') onChunk(d.text);
          else if (d.type === 'done') { finishedResolve(); ws.close(); }
          else if (d.type === 'error') { console.error('WS proxy error', d.error); finishedResolve(); ws.close(); }
        } catch (err) { console.error('WS message parse', err); }
      });
      ws.addEventListener('close', ()=>{ finishedResolve(); });
      return { cancel: ()=>{ try{ ws.close(); }catch(e){} }, finished };
    }

    const res = await fetch(`${backendBaseUrl}/api/llm-stream`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization': window.PROXY_TOKEN ? `Bearer ${window.PROXY_TOKEN}` : ''},
      body: JSON.stringify({ prompt })
    });
    if(!res.ok) throw new Error('LLM stream proxy error: '+res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let cancelled = false;
    let resolveDone;
    const finished = new Promise((r)=>{ resolveDone = r; });
    // read loop
    (async function(){
      try {
        while(!cancelled){
          const { value, done: d } = await reader.read();
          if (d) { break; }
          const chunk = decoder.decode(value, {stream: true});
          if (chunk) onChunk(chunk);
        }
      } catch (err) {
        console.error('Stream read error', err);
      } finally {
        resolveDone();
      }
    })();
    // return cancel function and finished promise
    return { cancel: ()=>{ cancelled = true; try{ reader.cancel(); }catch(e){} }, finished };
  }

  // helper to create an agent message element that we can append to progressively
  function createAgentStreamMessage(){ const el = document.createElement('div'); el.className='msg agent'; el.innerText=''; messages.appendChild(el); messages.scrollTop = messages.scrollHeight; return el; }

  // contact form (client-side only)
  function showContactForm(){ state='contact'; messages.innerHTML += ''; pushAgent('Please leave your name, email and a short note. We will follow up.');
    const name = document.createElement('input'); name.className='input'; name.placeholder='Your name';
    const email = document.createElement('input'); email.className='input'; email.placeholder='Email';
    const note = document.createElement('input'); note.className='input'; note.placeholder='Short message';
    const submit = makeBtn('Send','primary', ()=>{
      const data = {name: name.value||'', email: email.value||'', note: note.value||''};
      if(!data.email){ alert('Please include an email.'); return; }
      pushUser(`Contact: ${data.name || '-'} | ${data.email}`);
      pushAgent('Thanks — your request was recorded. We will contact you shortly.');
      // In a real integration, replace this console.log with an API call.
      console.info('Contact form submitted (client-only demo):', data);
      setTimeout(()=>{ 
        const restart = makeBtn('Start Over','', ()=>{ messages.innerHTML=''; setControls([]); runStart(); }); 
        setControls([restart]); 
      }, 500);
    });
    const wrapper = document.createElement('div'); wrapper.style.display='flex'; wrapper.style.flexDirection='column'; wrapper.style.gap='8px'; wrapper.appendChild(name); wrapper.appendChild(email); wrapper.appendChild(note); wrapper.appendChild(submit);
    setControls([wrapper]);
  }
  
  // helper to restart conversation
  function restartChat(){ messages.innerHTML=''; setControls([]); runStart(); }

  // auto-open small demo
  setTimeout(()=>{ /* leave closed until user toggles */ }, 400);

  // expose for debug
  window._chatWidget = {runStart};
})();
