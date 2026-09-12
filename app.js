const $ = (selector) => document.querySelector(selector);
const state = { lesson: null, submissions: [], diagnosed: false, sessionId: null, assets: null };
const samples = [
  { name: 'Student A · Exit ticket.pdf', label: 'Student 1', icon: 'PDF', demo: true },
  { name: 'Student B · Homework.pdf', label: 'Student 2', icon: 'PDF', demo: true },
  { name: 'Student C · Check-in.md', label: 'Student 3', icon: 'MD', demo: true }
];
const demoAnalysis = {
  classMastery: 64,
  skills: [
    { name: 'Identify composite functions', mastery: 83, students: [{ id: 'Student 1', status: 'secure' }, { id: 'Student 2', status: 'secure' }, { id: 'Student 3', status: 'developing' }] },
    { name: 'Apply the chain rule', mastery: 51, students: [{ id: 'Student 1', status: 'developing' }, { id: 'Student 2', status: 'needs_support' }, { id: 'Student 3', status: 'needs_support' }] },
    { name: 'Interpret derivative in context', mastery: 72, students: [{ id: 'Student 1', status: 'secure' }, { id: 'Student 2', status: 'developing' }, { id: 'Student 3', status: 'developing' }] }
  ],
  misconception: { title: 'Confusing inside and outside functions', evidence: 'Several students differentiate the outer function but leave the inner expression unchanged.', rootCause: 'Students recognize the derivative rule, but do not yet see a composite function as a sequence of transformations.', affectedStudentIds: ['Student 2', 'Student 3'] },
  recommendation: { title: 'Start with a visual function-machine reset.', detail: 'Then move into paired, real-world rate-of-change practice.' }
};

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
function renderSubmissions() { $('#submission-list').innerHTML = state.submissions.map((file) => `<span class="file-pill"><i>${escapeHtml(file.icon || 'DOC')}</i>${escapeHtml(file.name)}</span>`).join(''); }
function showLesson(file) {
  state.lesson = file || { name: 'Unit 2 — Derivatives in motion', demo: true };
  $('#lesson-loaded').classList.add('show'); $('#lesson-loaded b').textContent = state.lesson.name;
  $('#lesson-label').textContent = 'Replace lesson material';
}
function loadSamples() {
  state.submissions = [...samples]; renderSubmissions();
  $('#chat').insertAdjacentHTML('beforeend', '<div class="chat-bubble bot">Loaded three clearly labeled sample submissions. They stay in demo mode unless you upload real files.</div>');
  toast('3 sample submissions loaded');
}
function statusIcon(status) { return status === 'secure' ? '✓' : status === 'developing' ? '~' : '!'; }
function statusClass(status) { return status === 'secure' ? 'secure' : status === 'developing' ? 'developing' : 'critical'; }
function meterClass(value) { return value >= 80 ? 'high' : value >= 65 ? 'med' : 'low'; }
function renderAnalysis(analysis, isDemo) {
  $('#class-mastery').textContent = analysis.classMastery;
  $('#mastery-label').textContent = analysis.classMastery >= 80 ? 'Secure overall' : analysis.classMastery >= 65 ? 'Developing overall' : 'Priority support needed';
  $('#diagnostic-mode').textContent = isDemo ? 'DEMO DATA' : 'LIVE ANALYSIS';
  $('#diagnostic-meta').textContent = `Based on ${state.submissions.length} submission(s) · Generated just now`;
  $('#misconception-title').textContent = analysis.misconception.title;
  $('#misconception-evidence').textContent = analysis.misconception.evidence;
  $('#root-cause').textContent = analysis.misconception.rootCause;
  $('#recommendation-title').textContent = analysis.recommendation.title;
  $('#recommendation-detail').textContent = analysis.recommendation.detail;
  const affected = analysis.misconception.affectedStudentIds || [];
  $('#affected-students').innerHTML = `${affected.slice(0, 3).map((id) => `<i>${escapeHtml(id.replace('Student ', 'S'))}</i>`).join('')} ${affected.length} student${affected.length === 1 ? '' : 's'} affected`;
  $('#affected-students-detail').innerHTML = `<b>Affected learners</b>${affected.map((id) => `<span><i>${escapeHtml(id.replace('Student ', 'S'))}</i> ${escapeHtml(id)}</span>`).join('')}<button class="text-arrow" id="student-view">View individual insights →</button>`;
  $('#student-view').addEventListener('click', () => toast(`Support focus: ${affected.join(', ') || 'no individual learner flagged'}`));
  $('#skill-rows').innerHTML = analysis.skills.map((skill) => {
    const cells = skill.students.slice(0, 3).map((student) => `<i class="cell ${statusClass(student.status)}">${statusIcon(student.status)}</i>`).join('');
    return `<div class="skill-row"><b>${escapeHtml(skill.name)}</b><span><strong>${skill.mastery}%</strong><i class="meter ${meterClass(skill.mastery)}"><u style="width:${Math.max(0, Math.min(100, skill.mastery))}%"></u></i></span>${cells}<button aria-label="View ${escapeHtml(skill.name)}">→</button></div>`;
  }).join('');
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
async function runDiagnostic() {
  if (!state.submissions.length) loadSamples();
  if (!state.lesson) showLesson();
  const btn = $('#diagnose'); btn.innerHTML = '<span>Analyzing learning signals…</span><b>◌</b>'; btn.disabled = true;
  try {
    const realSubmissions = state.submissions.filter((entry) => entry.file);
    const canUseApi = state.lesson?.file && realSubmissions.length > 0;
    let analysis = demoAnalysis; let isDemo = true;
    if (canUseApi) {
      const form = new FormData(); form.append('lesson', state.lesson.file);
      realSubmissions.forEach((entry) => form.append('submissions', entry.file));
      const data = await request('/api/diagnose', { method: 'POST', body: form });
      analysis = data.analysis; state.sessionId = data.sessionId; isDemo = false;
    } else if (state.lesson?.file || realSubmissions.length) {
      throw new Error('For a live analysis, upload both a lesson file and at least one student submission. You can still run the sample demo with no uploaded files.');
    }
    state.diagnosed = true; state.assets = null; renderAnalysis(analysis, isDemo);
    $('#empty-dashboard').classList.add('hidden'); $('#results').classList.remove('hidden');
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#chat').insertAdjacentHTML('beforeend', `<div class="chat-bubble bot">${isDemo ? 'Demo diagnostic ready. Upload lesson and student files to receive a live analysis.' : 'Live diagnostic ready. Ask me how to address the evidence.'}</div>`);
    toast(isDemo ? 'Demo diagnostic complete' : `Live diagnostic complete · mastery ${analysis.classMastery}%`);
  } catch (error) { toast(error.message); } finally { btn.innerHTML = '<span>Analyze class work</span><b>→</b>'; btn.disabled = false; }
}
function base64ToBlob(data, type) { const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0)); return new Blob([bytes], { type }); }
function downloadAsset(type) {
  const asset = state.assets?.[type];
  if (!asset) return toast('Generate the live teaching assets first.');
  const link = document.createElement('a'); link.href = URL.createObjectURL(base64ToBlob(asset.data, asset.type)); link.download = asset.name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500); toast(`${asset.name} downloaded`);
}
async function generateAssets() {
  if (!state.diagnosed) return runDiagnostic();
  if (!state.sessionId) return toast('Upload real files and run a live analysis before generating binary assets.');
  const status = $('#asset-status'); status.textContent = 'Creating deck, audio, practice and plan…';
  $('#asset-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.querySelectorAll('.asset-card button').forEach((button) => { button.disabled = true; button.textContent = 'Creating…'; });
  try {
    const data = await request('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: state.sessionId }) });
    state.assets = data.files; status.textContent = '4 materials ready'; toast('Your deck, MP3 recap, practice and plan are ready');
    document.querySelectorAll('.asset-card button').forEach((button) => { button.disabled = false; button.innerHTML = 'Download asset <b>↓</b>'; });
  } catch (error) {
    status.textContent = 'Could not create assets'; toast(error.message);
    document.querySelectorAll('.asset-card button').forEach((button) => { button.disabled = false; button.innerHTML = 'Generate asset <b>→</b>'; });
  }
}
function demoChatReply(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('gap')) return 'The largest demo gap is applying the chain rule. Start with a visual inside-to-outside routine.';
  if (lower.includes('reteach') || lower.includes('plan')) return 'Use a 12-minute reset: color-code the functions, narrate what changes first, then try a paired motion problem.';
  return 'Upload real lesson material and student work, then run the live diagnostic so I can answer from your class evidence.';
}
async function chatReply(prompt) {
  $('#chat').insertAdjacentHTML('beforeend', `<div class="chat-bubble user-bubble">${escapeHtml(prompt)}</div>`);
  try {
    let reply;
    if (state.sessionId) {
      const data = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: state.sessionId, prompt }) });
      reply = data.text;
    } else reply = demoChatReply(prompt);
    $('#chat').insertAdjacentHTML('beforeend', `<div class="chat-bubble bot">${escapeHtml(reply)}</div>`);
  } catch (error) { $('#chat').insertAdjacentHTML('beforeend', `<div class="chat-bubble bot">${escapeHtml(error.message)}</div>`); }
  $('#chat').scrollTop = $('#chat').scrollHeight;
}

$('#lesson-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) { showLesson({ name: file.name, file }); toast('Lesson material added'); } });
$('#student-files').addEventListener('change', (event) => {
  const additions = [...event.target.files].filter((file) => file.size <= 5 * 1024 * 1024).map((file, index) => ({ name: file.name, file, icon: extension(file.name), label: `Student ${state.submissions.length + index + 1}` }));
  if (additions.length) { state.submissions = state.submissions.filter((entry) => !entry.demo); state.submissions.push(...additions); renderSubmissions(); toast(`${additions.length} student submission${additions.length > 1 ? 's' : ''} added`); }
});
function extension(name) { const parts = name.split('.'); return parts.length > 1 ? parts.at(-1).toUpperCase() : 'DOC'; }
$('#use-demo').addEventListener('click', () => { showLesson(); toast('Sample lesson selected'); });
$('#clear-lesson').addEventListener('click', () => { state.lesson = null; $('#lesson-loaded').classList.remove('show'); $('#lesson-label').textContent = 'Drop a PDF or PowerPoint here'; });
$('#load-samples').addEventListener('click', loadSamples); $('#diagnose').addEventListener('click', runDiagnostic); $('#rerun').addEventListener('click', runDiagnostic); $('#generate-assets').addEventListener('click', generateAssets); $('#generate-from-card').addEventListener('click', generateAssets);
$('#focus-gap').addEventListener('click', () => $('#misconception-detail').scrollIntoView({ behavior: 'smooth', block: 'center' }));
$('#student-view').addEventListener('click', () => toast('Student insights are available after a live analysis'));
$('#copy-note').addEventListener('click', async () => { const text = 'Use one color for the inner function and another for its change. Ask: “What changes first?” before asking students to calculate.'; try { await navigator.clipboard.writeText(text); } catch {} toast('Teaching note copied'); });
document.querySelectorAll('[data-download]').forEach((button) => button.addEventListener('click', () => state.assets ? downloadAsset(button.dataset.download) : generateAssets()));
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#chat-text'); if (input.value.trim()) { chatReply(input.value.trim()); input.value = ''; } });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => chatReply(button.dataset.prompt)));
