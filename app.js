const $ = (selector) => document.querySelector(selector);
const state = { lesson: true, submissions: [], diagnosed: false };
const samples = [
  { name: 'Student A · Exit ticket.pdf', label: 'Student A', icon: 'PDF' },
  { name: 'Student B · Homework.pdf', label: 'Student B', icon: 'PDF' },
  { name: 'Student C · Check-in.md', label: 'Student C', icon: 'MD' }
];

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}
function renderSubmissions() {
  $('#submission-list').innerHTML = state.submissions.map(file => `<span class="file-pill"><i>${file.icon || 'DOC'}</i>${file.name}</span>`).join('');
}
function showLesson(name = 'Unit 2 — Derivatives in motion') {
  state.lesson = true; $('#lesson-loaded').classList.add('show');
  $('#lesson-loaded b').textContent = name; $('#lesson-label').textContent = 'Replace lesson material';
}
function loadSamples() {
  state.submissions = [...samples]; renderSubmissions();
  $('#chat').innerHTML += `<div class="chat-bubble bot">Loaded three <b>clearly labeled sample submissions</b>. They’re session-only and ready for a demonstration.</div>`;
  toast('3 sample submissions loaded');
}
function runDiagnostic() {
  if (!state.submissions.length) { loadSamples(); }
  if (!state.lesson) showLesson();
  const btn = $('#diagnose'); btn.innerHTML = '<span>Reading learning signals…</span><b>◌</b>'; btn.disabled = true;
  setTimeout(() => {
    state.diagnosed = true; btn.innerHTML = '<span>Analyze class work</span><b>→</b>'; btn.disabled = false;
    $('#empty-dashboard').classList.add('hidden'); $('#results').classList.remove('hidden');
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#chat').innerHTML += `<div class="chat-bubble bot">I found a clear pattern: <b>2 learners need help seeing the chain rule as a sequence.</b> The class is strongest at recognizing composite functions.</div>`;
    toast('Diagnostic complete · class mastery 64%');
  }, 1000);
}
function generateAssets() {
  if (!state.diagnosed) { runDiagnostic(); setTimeout(generateAssets, 1100); return; }
  const status = $('#asset-status'); status.textContent = 'Creating four assets in parallel…';
  $('#asset-section').scrollIntoView({behavior:'smooth', block:'center'});
  document.querySelectorAll('.asset-card button').forEach(b => { b.disabled=true; b.innerHTML='Creating…'; });
  setTimeout(() => {
    status.textContent = '4 materials ready';
    document.querySelectorAll('.asset-card button').forEach((b) => { b.disabled=false; b.innerHTML='Download asset <b>↓</b>'; });
    toast('Your deck, practice, recap, and plan are ready');
  }, 1300);
}
function download(type) {
  const content = {
    pptx: 'CLASSROOM COMPASS\nTargeted Lesson Deck\n\n1. The chain rule: what changes first?\n2. Visual function machine\n3. Guided practice\n4. Motion in the real world\n5. Exit ticket',
    audio: 'Audio recap script\n\nThe most important idea today is that a composite function has two layers. First, identify the inside function. Then ask how it changes. The chain rule connects those two changes. Practice by circling the inside function before differentiating each expression.',
    practice: 'REAL-WORLD PRACTICE: RATE OF CHANGE\n\n1. A sensor records temperature T(t) = (3t + 2)^2. What is the rate of change at t = 4?\n\n2. Explain, in words, why the derivative of the inside expression matters.\n\n3. A car’s position is s(t) = (t² + 1)^3. Find its velocity and interpret the result.',
    calendar: 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Chain Rule Visual Reset\nDTSTART:20260915T090000\nDTEND:20260915T092000\nDESCRIPTION:Use function-machine colors and guided practice.\nEND:VEVENT\nEND:VCALENDAR'
  }[type];
  const extensions = {pptx:'pptx-outline.txt',audio:'audio-recap-script.txt',practice:'practice-set.txt',calendar:'review-plan.ics'};
  const blob = new Blob([content], {type: type === 'calendar' ? 'text/calendar' : 'text/plain'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `classroom-compass-${extensions[type]}`; link.click(); URL.revokeObjectURL(link.href);
  toast(`${type === 'pptx' ? 'Slide-deck outline' : 'Teaching asset'} downloaded`);
}

$('#lesson-file').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { showLesson(file.name); toast('Lesson material added'); }});
$('#student-files').addEventListener('change', (e) => { const additions = [...e.target.files].filter(f => f.size <= 5 * 1024 * 1024).map((f,i) => ({name: f.name, icon: f.name.split('.').pop().toUpperCase(), label:`Student ${state.submissions.length+i+1}`})); if(additions.length) { state.submissions.push(...additions); renderSubmissions(); toast(`${additions.length} student submission${additions.length>1?'s':''} added`); } });
$('#use-demo').addEventListener('click', () => { showLesson(); toast('Sample lesson selected'); });
$('#clear-lesson').addEventListener('click', () => { state.lesson=false; $('#lesson-loaded').classList.remove('show'); $('#lesson-label').textContent='Drop a PDF or PowerPoint here'; });
$('#load-samples').addEventListener('click', loadSamples); $('#diagnose').addEventListener('click', runDiagnostic); $('#rerun').addEventListener('click', runDiagnostic); $('#generate-assets').addEventListener('click', generateAssets); $('#generate-from-card').addEventListener('click', generateAssets);
$('#focus-gap').addEventListener('click', () => $('#misconception-detail').scrollIntoView({behavior:'smooth', block:'center'}));
$('#student-view').addEventListener('click', () => toast('Student insights: A is developing; B needs targeted support'));
$('#copy-note').addEventListener('click', async () => { const text = 'Don’t reteach the rule. Rebuild the picture. Use one color for the inner function and another for its change. Ask: “What changes first?”'; try { await navigator.clipboard.writeText(text); } catch {} toast('Teaching note copied'); });
document.querySelectorAll('[data-download]').forEach(button => button.addEventListener('click', () => { if(button.textContent.includes('Generate')) generateAssets(); else download(button.dataset.download); }));
function chatReply(prompt) { const lower = prompt.toLowerCase(); let reply = 'I can help turn this diagnostic into a focused next step. Try asking about the chain rule misconception or generating a practice set.'; if (lower.includes('gap')) reply = 'The largest gap is <b>applying the chain rule (51% mastery)</b>. Two students differentiate only the outer function. Start with a visual “inside → outside” routine.'; if (lower.includes('reteach') || lower.includes('plan')) reply = 'I’d use a 12-minute reset: color-code the inner and outer functions, narrate what changes first, then give one paired motion problem. Your targeted assets are ready to generate.'; $('#chat').innerHTML += `<div class="chat-bubble user-bubble">${prompt}</div><div class="chat-bubble bot">${reply}</div>`; $('#chat').scrollTop=$('#chat').scrollHeight; }
$('#chat-form').addEventListener('submit', e => { e.preventDefault(); const input=$('#chat-text'); if(input.value.trim()){chatReply(input.value.trim());input.value='';} }); document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>chatReply(b.dataset.prompt)));
