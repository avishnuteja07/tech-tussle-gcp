const $ = (selector) => document.querySelector(selector);
const form = $('#login-form');
const loginView = $('#login-view');
const dashboardView = $('#dashboard-view');
const quizView = $('#quiz-view');
const submittedView = $('#submitted-view');
const adminLoginView = $('#admin-login-view');
const adminView = $('#admin-view');
const adminActivityPanel = $('#admin-activity-panel');
const adminStudentsPanel = $('#admin-students-panel');
const message = $('#message');
const submitButton = form.querySelector('.submit-button');
const password = $('#password');
let signedInUser = null;
let attempt = null;
let answerState = {};
let chosenByTask = {};
let timerHandle = null;
let saveHandle = null;
let integrityViolationCount = 0;
let integrityEventQueue = Promise.resolve();
let examFullscreenActive = false;
let adminRefreshHandle = null;
let presenceHandle = null;
const views = [loginView, dashboardView, quizView, submittedView, adminLoginView, adminView];
let editingRegistrationNumber = '';

const LEVEL2_TEST_CASES = {
  'traffic-1': [
    ['Open page', 'Three grey lights appear'],
    ['Click button once', 'Red light turns on'],
    ['Click button again', 'Yellow light turns on'],
    ['Click button again', 'Green light turns on'],
    ['Click button again', 'Signal returns to red'],
  ],
  'water-1': [
    ['Open page', 'Count shows 0'],
    ['Click Drink Water', 'Count shows 1'],
    ['Click Drink Water twice more', 'Count shows 3'],
    ['Click Reset', 'Count returns to 0'],
    ['Drink water after reset', 'Count shows 1'],
  ],
  'css-1': [
    ['Container layout', 'display:flex; justify-content:center; align-items:center; full viewport height'],
    ['Card size', 'width:250px; padding:20px; text-align:center'],
    ['Card border', '2px solid #333; border-radius:10px'],
    ['Text styles', '.title is #1a73e8; .role is #666 and italic'],
    ['Button', 'blue background; white text; no border; 5px radius; 8px padding'],
  ],
  'express-1': [
    ['GET /students', 'HTTP 200 and all 3 initial students'],
    ['GET /students?pass=true', 'Only Ravi and Sita (marks >= 50)'],
    ['GET /students/2 and /students/99', 'Sita with 200; then { error: "Not found" } with 404'],
    ['POST valid student', 'Kiran with marks 70 returns 201 and id 4'],
    ['POST invalid data', 'Blank name and marks 150 each return 400 { error: "Invalid data" }; list stays at 4'],
  ],
  'react-1': [
    ['Initial cart', 'Cart is empty; Total: ₹0'],
    ['Add Pen', 'Pen x 1; Total: ₹10'],
    ['Add Pen twice, then Book', 'Pen x 2; Book x 1; Total: ₹70'],
    ['Decrease Book', 'Book is removed at quantity 0; Total: ₹20'],
    ['Quantity cap', 'After adding Pen and clicking +Pen 10 times: Pen x 5; Total: ₹50'],
  ],
};

function showView(view) {
  for (const element of views) element.hidden = element !== view;
  $('.login-card').classList.toggle('wide', view === quizView || view === adminView);
  document.body.classList.toggle('exam-mode', view === quizView);
  clearInterval(adminRefreshHandle);
  if (view === adminView) adminRefreshHandle = setInterval(() => {
    if (adminStudentsPanel.hidden) refreshAdminDashboard();
  }, 3000);
}

function showDashboard(user) {
  signedInUser = user;
  const yearLabel = ({ 1: 'I', 2: 'II', 3: 'III' })[user.studyYear] || '';
  $('#welcome').textContent = `${user.registrationNumber} · ${yearLabel}`;
  $('#level-details').textContent = user.studyYear === 1
    ? '15 minutes · Choose one question from each task.'
    : '15 minutes · 4 questions · 5 marks each · 20 marks total';
  showView(dashboardView);
  clearInterval(presenceHandle);
  setStudentProgress(user.progress);
  refreshLevelAccess();
  presenceHandle = setInterval(refreshLevelAccess, 15000);
}

function setStudentProgress(progress = {}) {
  const level1Completed = Boolean(progress.level1Completed);
  const level2Completed = Boolean(progress.level2Completed);
  const level3Completed = Boolean(progress.level3Completed);
  const level1Unlocked = progress.level1Unlocked ?? (!level1Completed && !level2Completed && !level3Completed);
  const level2Unlocked = progress.level2Unlocked ?? (level1Completed && !level2Completed && !level3Completed);
  const level3Unlocked = progress.level3Unlocked ?? (level2Completed && !level3Completed);
  $('#start-level').disabled = !level1Unlocked;
  $('#level1-card').classList.toggle('level-locked', !level1Unlocked);
  $('#level1-access-message').textContent = level1Completed
    ? 'Successfully completed — Level 1 is locked.'
    : level2Completed || level3Completed
      ? 'Locked — continue with the next unlocked level.'
      : 'Available — complete this level to unlock Level 2.';
  $('#start-level-2').disabled = !level2Unlocked;
  $('#level2-card').classList.toggle('level-locked', !level2Unlocked);
  $('#level2-access-message').textContent = level3Completed
    ? 'Successfully completed — Level 3 is complete.'
    : level2Completed
    ? 'Successfully completed — Level 3 is unlocked.'
    : level2Unlocked
      ? 'Unlocked — you can start Level 2.'
      : 'Locked — complete Level 1 to unlock this level.';
  $('#start-level-3').disabled = !level3Unlocked;
  $('#level3-card').classList.toggle('level-locked', !level3Unlocked);
  $('#level3-access-message').textContent = level3Completed
    ? 'Successfully completed — all levels are now locked.'
    : level3Unlocked
      ? 'Unlocked — you can start Level 3.'
      : 'Locked — complete Level 2 to unlock this level.';
}

async function refreshLevelAccess() {
  try {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) return;
    const user = await response.json();
    if (user.authenticated) setStudentProgress(user.progress);
  } catch {}
}

async function postJson(path, payload = {}) {
  let response;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('The login server is unavailable. Start the app with Start Login Page.bat, then reload this page.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

$('.show-password').addEventListener('click', (event) => {
  const showing = password.type === 'password';
  password.type = showing ? 'text' : 'password';
  event.currentTarget.textContent = showing ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', `${showing ? 'Hide' : 'Show'} password`);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  submitButton.disabled = true;
  submitButton.querySelector('span').textContent = 'Signing in…';
  try {
    const result = await postJson('/api/login', {
      registrationNumber: $('#registration-number').value,
      password: password.value,
      studyYear: $('#study-year').value,
    });
    form.reset();
    showDashboard(result);
    await resumeAttemptIfAny();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span').textContent = 'Sign in';
  }
});

$('#admin-mode-button').addEventListener('click', () => { $('#admin-login-message').textContent = ''; showView(adminLoginView); });
$('#student-mode-button').addEventListener('click', () => { $('#admin-login-message').textContent = ''; showView(loginView); });

function showAdminPanel(panel) {
  const students = panel === 'students';
  adminActivityPanel.hidden = students;
  adminStudentsPanel.hidden = !students;
  $('#admin-activity-tab').classList.toggle('active', !students);
  $('#admin-students-tab').classList.toggle('active', students);
  if (students) loadStudents();
  else refreshAdminDashboard();
}

$('#admin-activity-tab').addEventListener('click', () => showAdminPanel('activity'));
$('#admin-students-tab').addEventListener('click', () => showAdminPanel('students'));

function renderStudents(students) {
  const host = $('#student-list');
  if (!students.length) { host.textContent = 'No registered students yet.'; return; }
  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  for (const label of ['Registration number', 'Year', 'Actions']) {
    const th = document.createElement('th'); th.textContent = label; header.append(th);
  }
  head.append(header);
  const body = document.createElement('tbody');
  for (const student of students) {
    const row = document.createElement('tr');
    const romanYear = ({ 1: 'I', 2: 'II', 3: 'III' })[student.studyYear] || '';
    for (const value of [student.registrationNumber, romanYear]) {
      const cell = document.createElement('td'); cell.textContent = value || ''; row.append(cell);
    }
    const actions = document.createElement('td');
    const buttons = document.createElement('div'); buttons.className = 'student-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => beginStudentEdit(student));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.className = 'delete';
    remove.addEventListener('click', () => deleteStudent(student));
    buttons.append(edit, remove); actions.append(buttons); row.append(actions); body.append(row);
  }
  table.append(head, body); host.replaceChildren(table);
}

async function loadStudents() {
  const host = $('#student-list');
  host.textContent = 'Loading registered students…';
  try {
    const response = await fetch('/api/admin/students', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load student accounts.');
    renderStudents(data.students || []);
  } catch (error) { host.textContent = error.message; }
}

function resetStudentForm() {
  $('#student-form').reset();
  $('#student-edit-original').value = '';
  $('#managed-registration').readOnly = false;
  $('#managed-password').value = 'tech@123';
  $('#managed-password').required = true;
  $('#managed-password-help').textContent = 'Default password: tech@123';
  $('#save-student').querySelector('span').textContent = 'Save student';
  $('#cancel-student-edit').hidden = true;
  editingRegistrationNumber = '';
}

function beginStudentEdit(student) {
  editingRegistrationNumber = student.registrationNumber;
  $('#student-edit-original').value = student.registrationNumber;
  $('#managed-registration').value = student.registrationNumber;
  $('#managed-registration').readOnly = false;
  $('#managed-year').value = String(student.studyYear);
  $('#managed-password').value = '';
  $('#managed-password').required = false;
  $('#student-form-message').textContent = '';
  $('#save-student').querySelector('span').textContent = 'Update student';
  $('#cancel-student-edit').hidden = false;
  $('#managed-registration').focus();
}

const managedRegistration = $('#managed-registration');
managedRegistration.addEventListener('input', () => {
  const start = managedRegistration.selectionStart;
  managedRegistration.value = managedRegistration.value.toUpperCase();
  if (start !== null) managedRegistration.setSelectionRange(start, start);
});
$('#registration-number').addEventListener('input', (event) => {
  event.currentTarget.value = event.currentTarget.value.toUpperCase();
});

$('#student-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('#student-form-message');
  const save = $('#save-student');
  status.textContent = '';
  save.disabled = true;
  const payload = {
    registrationNumber: managedRegistration.value.trim().toUpperCase(),
    studyYear: Number($('#managed-year').value),
    password: $('#managed-password').value,
  };
  try {
    const original = editingRegistrationNumber;
    const response = await fetch(original ? `/api/admin/students/${encodeURIComponent(original)}` : '/api/admin/students', {
      method: original ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error === 'Not found'
      ? 'The student management API is not available on this server. Restart the latest app with Start Login Page.bat, then reload this page.'
      : data.error || 'Could not save student.');
    status.classList.add('success-message');
    status.textContent = original ? 'Student account updated.' : 'Student account added. They can sign in with this registration number and password.';
    resetStudentForm();
    loadStudents();
  } catch (error) { status.classList.remove('success-message'); status.textContent = error.message; }
  finally { save.disabled = false; }
});

$('#cancel-student-edit').addEventListener('click', () => { resetStudentForm(); $('#student-form-message').textContent = ''; });

async function deleteStudent(student) {
  if (!window.confirm(`Delete ${student.fullName} (${student.registrationNumber}) and their saved attempts?`)) return;
  try {
    const response = await fetch(`/api/admin/students/${encodeURIComponent(student.registrationNumber)}`, { method: 'DELETE', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete student.');
    $('#student-import-message').textContent = `Deleted ${student.registrationNumber} and their sessions and attempts.`;
    loadStudents();
  } catch (error) { $('#student-import-message').textContent = error.message; }
}

async function downloadFromAdmin(path, filename) {
  const status = $('#student-import-message');
  try {
    const response = await fetch(path, { cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('spreadsheetml.sheet')) {
      const error = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
      throw new Error(error.error === 'Not found'
        ? 'The student management API is not available on this server. Restart the latest app with Start Login Page.bat, then reload this page.'
        : error.error || 'The server did not return an Excel workbook.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '';
  } catch (error) { status.textContent = error.message; }
}

$('#download-student-template').addEventListener('click', () => downloadFromAdmin('/api/admin/students/template', 'student-import-template.xlsx'));
$('#export-students').addEventListener('click', () => downloadFromAdmin('/api/admin/students/export', 'registered-students.xlsx'));
$('#refresh-students').addEventListener('click', loadStudents);

$('#import-students').addEventListener('click', async () => {
  const input = $('#student-workbook');
  const status = $('#student-import-message');
  const file = input.files?.[0];
  status.classList.remove('success-message');
  if (!file) { status.textContent = 'Choose an .xlsx workbook first.'; return; }
  if (!file.name.toLowerCase().endsWith('.xlsx')) { status.textContent = 'Upload an .xlsx workbook.'; return; }
  status.textContent = 'Importing workbook…';
  try {
    const response = await fetch('/api/admin/students/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not import workbook.');
    const details = (data.errors || []).slice(0, 8).map((error) => `Row ${error.row}: ${error.error}`).join(' · ');
    status.classList.toggle('success-message', data.imported > 0);
    status.textContent = `Imported ${data.imported}; skipped ${data.skipped}.${details ? ` ${details}` : ''}`;
    input.value = '';
    loadStudents();
  } catch (error) { status.textContent = error.message; }
});

$('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const adminForm = event.currentTarget;
  const status = $('#admin-login-message');
  status.textContent = '';
  try {
    await postJson('/api/admin/login', { username: $('#admin-username').value, password: $('#admin-password').value });
    adminForm.reset();
    showAdminPanel('activity');
    showView(adminView);
    await refreshAdminDashboard();
  } catch (error) {
    status.textContent = error.message === 'Not found'
      ? 'The administrator login API is not available on this server. Restart the latest app with Start Login Page.bat, then reload this page.'
      : error.message;
  }
});

function makeTable(host, headings, rows) {
  if (!rows.length) { host.textContent = 'No attempts yet.'; return; }
  const table = document.createElement('table'); table.className = 'leaderboard-table';
  const thead = document.createElement('thead'); const header = document.createElement('tr');
  headings.forEach((label) => { const th = document.createElement('th'); th.textContent = label; header.append(th); }); thead.append(header);
  const tbody = document.createElement('tbody');
  rows.forEach((values) => { const tr = document.createElement('tr'); values.forEach((value) => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); tbody.append(tr); });
  table.append(thead, tbody); host.replaceChildren(table);
}

async function refreshAdminDashboard() {
  try {
    const selectedLevel = Number($('#admin-level').value || 1);
    const response = await fetch(`/api/admin/dashboard?level=${selectedLevel}`, { cache: 'no-store' });
    if (response.status === 401) { showView(adminLoginView); return; }
    if (!response.ok) throw new Error('Dashboard request failed.');
    const data = await response.json();
    const levelName = ({ 1: 'Bug Smash', 2: 'Code Rescue', 3: 'Algorithm Challenge' })[selectedLevel];
    $('#admin-title').textContent = `Level ${selectedLevel} activity · ${levelName}`;
    const totals = Object.values(data.cohorts).reduce((sum, c) => ({ registered: sum.registered + c.registered, loggedIn: sum.loggedIn + c.loggedIn, attempted: sum.attempted + c.attempted, completed: sum.completed + c.completed, inProgress: sum.inProgress + c.inProgress }), { registered: 0, loggedIn: 0, attempted: 0, completed: 0, inProgress: 0 });
    $('#admin-stats').innerHTML = '';
    [['Registered', totals.registered], ['Logged in now', totals.loggedIn], ['Attempted', totals.attempted], ['Completed', totals.completed], ['In progress', totals.inProgress]].forEach(([label, value]) => {
      const card = document.createElement('article'); card.className = 'stat-card'; const strong = document.createElement('strong'); strong.textContent = value; const span = document.createElement('span'); span.textContent = label; card.append(strong, span); $('#admin-stats').append(card);
    });
  const cohortRows = [1, 2, 3].map((year) => { const c = data.cohorts[year]; return [`Year ${{1:'I',2:'II',3:'III'}[year]}`, c.registered, c.loggedIn, c.attempted, c.completed, c.inProgress, ...[1,2,3,4].map((n) => c.questionCounts[n])]; });
    makeTable($('#admin-cohorts'), ['Cohort', 'Registered', 'Logged in', 'Attempted', 'Completed', 'Live', '1 answer', '2 answers', '3 answers', '4 answers'], cohortRows);
    const maximum = selectedLevel === 3 ? 50 : selectedLevel === 2 ? 30 : 20;
    const totalQuestions = selectedLevel === 3 ? 2 : selectedLevel === 2 ? 3 : 4;
    const rows = data.leaderboard.map((entry, index) => [`${index + 1}`, entry.name, `Year ${{1:'I',2:'II',3:'III'}[entry.year] || '—'}`, entry.status, `${entry.answered}/${totalQuestions}`, selectedLevel >= 2 ? `${entry.correct}/${selectedLevel === 3 ? 10 : 15}` : `${entry.correct}`, `${entry.score}/${maximum}`, `${entry.seconds}s`]);
    makeTable($('#admin-leaderboard'), ['#', 'Student', 'Year', 'Status', 'Answered', selectedLevel >= 2 ? 'Passed tests' : 'Correct', 'Score', 'Time'], rows);
    $('#admin-updated').textContent = `Updated ${new Date(data.updatedAt * 1000).toLocaleTimeString()}`;
  } catch {
    $('#admin-stats').replaceChildren();
    $('#admin-cohorts').textContent = 'Dashboard unavailable. Data could not be loaded from the server.';
    $('#admin-leaderboard').textContent = 'Dashboard unavailable.';
    $('#admin-updated').textContent = 'Dashboard unavailable';
  }
}

$('#admin-logout').addEventListener('click', async () => { await postJson('/api/admin/logout').catch(() => {}); showView(loginView); });
$('#admin-level').addEventListener('change', refreshAdminDashboard);

async function signOutStudent() {
  if (attempt && !quizView.hidden) {
    clearTimeout(saveHandle);
    await postJson('/api/save-attempt', { attemptId: attempt.id, answers: answerState }).catch(() => {});
  }
  clearInterval(timerHandle);
  clearTimeout(saveHandle);
  clearInterval(presenceHandle);
  await postJson('/api/logout').catch(() => {});
  signedInUser = null;
  attempt = null;
  examFullscreenActive = false;
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  showView(loginView);
}

function renderQuestions() {
  const host = $('#questions');
  host.replaceChildren();
  const firstYear = signedInUser.studyYear === 1 && attempt.level === 1;
  for (const task of attempt.tasks) {
    const taskCard = document.createElement('section');
    taskCard.className = 'task-card';
    const taskHeading = document.createElement('h2');
    taskHeading.textContent = task.title;
    taskCard.append(taskHeading);
    let question = task.questions[0];
    if (firstYear) {
      const choices = document.createElement('div');
      choices.className = 'question-picker';
      for (const option of task.questions) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = `question-choice${chosenByTask[task.id] === option.id ? ' selected' : ''}`;
        choice.textContent = option.id.slice(task.id.length + 1);
        choice.title = option.prompt;
        choice.setAttribute('aria-label', `${option.id}: ${option.prompt}`);
        choice.addEventListener('click', () => {
          if (chosenByTask[task.id] && chosenByTask[task.id] !== option.id) delete answerState[chosenByTask[task.id]];
          chosenByTask[task.id] = option.id;
          if (!Object.hasOwn(answerState, option.id)) answerState[option.id] = '';
          scheduleSave();
          renderQuestions();
        });
        choices.append(choice);
      }
      taskCard.append(choices);
      question = task.questions.find((option) => option.id === chosenByTask[task.id]);
    }
    if (question) {
      const card = document.createElement('article');
      card.className = attempt.level === 3 ? 'question-card level3-question-card' : 'question-card';
      let problemPane = card;
      let codingPane = card;
      if (attempt.level === 3) {
        const workspace = document.createElement('div');
        workspace.className = 'level3-workspace';
        problemPane = document.createElement('section');
        problemPane.className = 'level3-problem-pane';
        codingPane = document.createElement('section');
        codingPane.className = 'level3-coding-pane';
        workspace.append(problemPane, codingPane);
        card.append(workspace);
      }
      const heading = document.createElement('h3');
      heading.textContent = attempt.level === 3
        ? 'Question · 25 marks (5 test cases × 5 marks)'
        : attempt.level === 2 ? 'Question · 10 marks (5 tests × 2 marks)' : firstYear ? 'Selected question' : 'Question · 5 marks';
      const prompt = document.createElement('p');
      prompt.textContent = question.prompt;
      if (attempt.level === 3) {
        const code = document.createElement('pre');
        code.textContent = `Input: ${question.inputFormat}\nOutput: ${question.outputFormat}`;
        problemPane.append(heading, prompt, code);
      } else if (attempt.level === 2) {
        problemPane.append(heading, prompt);
      } else {
        const code = document.createElement('pre');
        code.textContent = question.code;
        problemPane.append(heading, prompt, code);
      }
      if (attempt.level === 3) {
        const examples = document.createElement('div');
        examples.className = 'level3-examples';
        const examplesHeading = document.createElement('h4');
        examplesHeading.textContent = 'Examples';
        examples.append(examplesHeading);
        for (const [index, example] of question.examples.entries()) {
          const exampleCard = document.createElement('div');
          exampleCard.className = 'level3-example';
          const exampleTitle = document.createElement('strong');
          exampleTitle.textContent = `Example ${index + 1}`;
          const inputLabel = document.createElement('span');
          inputLabel.textContent = 'Input';
          const inputValue = document.createElement('pre');
          inputValue.textContent = example.input;
          const outputLabel = document.createElement('span');
          outputLabel.textContent = 'Output';
          const outputValue = document.createElement('pre');
          outputValue.textContent = example.output;
          const tryInput = document.createElement('button');
          tryInput.type = 'button';
          tryInput.className = 'try-example-button';
          tryInput.textContent = 'Use this input';
          tryInput.addEventListener('click', () => {
            const target = card.querySelector('.debug-input');
            if (target) { target.value = example.input; target.focus(); }
          });
          exampleCard.append(exampleTitle, inputLabel, inputValue, outputLabel, outputValue, tryInput);
          examples.append(exampleCard);
        }
        problemPane.append(examples);
      }
      const label = document.createElement('label');
      label.textContent = attempt.level === 3 ? 'Programming language' : 'Your fix / answer';
      label.htmlFor = `answer-${question.id}`;
      let languageSelect = null;
      let sourceLabel = null;
      if (attempt.level === 3) {
        languageSelect = document.createElement('select');
        languageSelect.id = `language-${question.id}`;
        languageSelect.className = 'level3-language';
        languageSelect.setAttribute('aria-label', `Language for ${question.title}`);
        for (const [value, name] of [['c','C'],['cpp','C++'],['csharp','C#'],['java','Java'],['javascript','JavaScript'],['python','Python']]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = name;
          languageSelect.append(option);
        }
        languageSelect.value = answerState[question.id]?.language || 'python';
        label.htmlFor = languageSelect.id;
        sourceLabel = document.createElement('label');
      sourceLabel.textContent = question.starterCode?.[languageSelect.value] ? 'Implement the function below; starter handles input and output.' : 'Complete program';
        sourceLabel.htmlFor = `answer-${question.id}`;
      }
      const textarea = document.createElement('textarea');
      textarea.id = `answer-${question.id}`;
      textarea.rows = attempt.level === 3 ? 18 : attempt.level === 2 ? 18 : 5;
      if (attempt.level === 2 || attempt.level === 3) {
        if (attempt.level === 3) textarea.classList.add('level3-editor');
        if (attempt.level === 2) textarea.classList.add('level2-editor');
        textarea.spellcheck = false;
        textarea.autocapitalize = 'off';
        textarea.autocomplete = 'off';
        textarea.addEventListener('keydown', (event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            textarea.setRangeText('    ', textarea.selectionStart, textarea.selectionEnd, 'end');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            card.querySelector('.run-tests-button, .debug-run-button, .run-btn')?.click();
          }
        });
      }
      textarea.placeholder = question.id === 'traffic-1'
        ? 'Write HTML, CSS, and JavaScript for the traffic signal…'
        : question.id === 'water-1'
          ? 'Write HTML, CSS, and JavaScript for the water tracker…'
          : question.id === 'css-1'
            ? 'Write CSS rules for the GMOCS fest card…'
            : question.id === 'express-1'
              ? 'Write the Express routes here…'
              : question.id === 'react-1'
                ? 'Write cart state and functions here…'
              : attempt.level === 3
                ? 'Implement the function in the starter code, or write a complete program for this language…'
                : 'Write your corrected code…';
      const selectedLevel3Language = languageSelect?.value;
      const starterCode = attempt.level === 3 ? question.starterCode?.[selectedLevel3Language] || '' : '';
      let level3SolutionMode = attempt.level === 3
        ? answerState[question.id]?.mode || (starterCode && !answerState[question.id]?.source ? 'function' : 'program')
        : 'program';
      textarea.value = attempt.level === 3
        ? answerState[question.id]?.source || starterCode
        : attempt.level === 2
          ? answerState[question.id] || question.code
          : answerState[question.id] || '';
      if (attempt.level === 2 && !answerState[question.id]) {
        answerState[question.id] = question.code;
      }
      textarea.addEventListener('input', () => {
        answerState[question.id] = attempt.level === 3
          ? { language: languageSelect.value, source: textarea.value, mode: level3SolutionMode }
          : textarea.value;
        if (attempt.level === 2) {
          card.querySelectorAll('.test-status').forEach((status) => {
            status.textContent = 'Not run';
            status.classList.remove('passed', 'failed');
          });
          const testSummary = card.querySelector('.test-summary');
          if (testSummary) testSummary.textContent = 'Code changed. Run tests again.';
        }
        if (attempt.level === 3) resetLevel3TestStatuses(card);
        scheduleSave();
      });
      if (languageSelect) {
        let previousLanguage = languageSelect.value;
        languageSelect.addEventListener('change', () => {
          const previousStarter = question.starterCode?.[previousLanguage] || '';
          const nextStarter = question.starterCode?.[languageSelect.value] || '';
          const wasStarter = !textarea.value.trim() || (previousStarter && textarea.value === previousStarter);
          if (wasStarter) textarea.value = nextStarter;
          level3SolutionMode = wasStarter && nextStarter ? 'function' : 'program';
          sourceLabel.textContent = nextStarter ? 'Implement the function below; starter handles input and output.' : 'Complete program';
          answerState[question.id] = { language: languageSelect.value, source: textarea.value, mode: level3SolutionMode };
          previousLanguage = languageSelect.value;
          resetLevel3TestStatuses(card);
          scheduleSave();
        });
        codingPane.append(label, languageSelect, sourceLabel);
      } else if (attempt.level === 2) {
        const toolbar = document.createElement('div');
        toolbar.className = 'level2-editor-toolbar';
        const titleSpan = document.createElement('label');
        titleSpan.className = 'level2-editor-title';
        titleSpan.textContent = question.id === 'css-1'
          ? 'Code Editor · HTML & CSS (GMOCS Fest Card)'
          : 'Code Editor · HTML, CSS, JavaScript (single editable codebase)';
        titleSpan.htmlFor = textarea.id;

        const actions = document.createElement('div');
        actions.className = 'level2-editor-actions';

        const runPreviewBtn = document.createElement('button');
        runPreviewBtn.type = 'button';
        runPreviewBtn.className = 'editor-action-btn run-btn';
        runPreviewBtn.textContent = '▶ Run / Preview';
        runPreviewBtn.title = 'Run code in the live preview below';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'editor-action-btn reset-btn';
        resetBtn.textContent = '↺ Reset to Default';
        resetBtn.title = 'Clean and display default starter code';

        actions.append(runPreviewBtn, resetBtn);
        toolbar.append(titleSpan, actions);
        codingPane.append(toolbar);
      } else codingPane.append(label);
      if (attempt.level === 3) {
        const editorToolbar = document.createElement('div');
        editorToolbar.className = 'editor-toolbar';
        const editorName = document.createElement('span');
        editorName.textContent = 'Solution';
        const fullscreenButton = document.createElement('button');
        fullscreenButton.type = 'button';
        fullscreenButton.className = 'editor-fullscreen-button';
        fullscreenButton.textContent = 'Expand editor';
        fullscreenButton.addEventListener('click', () => {
          const expanded = card.classList.toggle('editor-expanded');
          fullscreenButton.textContent = expanded ? 'Exit expanded view' : 'Expand editor';
        });
        const starterButton = document.createElement('button');
        starterButton.type = 'button';
        starterButton.className = 'editor-fullscreen-button';
        starterButton.textContent = 'Load function starter';
        starterButton.hidden = !question.starterCode?.[languageSelect.value];
        starterButton.addEventListener('click', () => {
          const starter = question.starterCode?.[languageSelect.value];
          if (!starter) return;
          textarea.value = starter;
          level3SolutionMode = 'function';
          answerState[question.id] = { language: languageSelect.value, source: starter, mode: level3SolutionMode };
          resetLevel3TestStatuses(card);
          scheduleSave();
        });
        languageSelect.addEventListener('change', () => { starterButton.hidden = !question.starterCode?.[languageSelect.value]; });
        editorToolbar.append(editorName, starterButton, fullscreenButton);
        codingPane.append(editorToolbar);
      }
      codingPane.append(textarea);
      if (attempt.level === 2) addLevel2TestRunner(question, textarea, card);
      if (attempt.level === 3) addLevel3TestRunner(question, languageSelect, textarea, card, codingPane, () => level3SolutionMode);
      taskCard.append(card);
    }
    host.append(taskCard);
  }
}

function resetLevel3TestStatuses(card) {
  card.querySelectorAll('.test-status').forEach((status) => {
    status.textContent = 'Not run';
    status.classList.remove('passed', 'failed');
  });
  const summary = card.querySelector('.test-summary');
  if (summary) summary.textContent = 'Solution changed. Run tests again.';
}

function addLevel3TestRunner(question, languageSelect, editor, card, codingPane = card, currentSolutionMode = () => 'program') {
  const debugPanel = document.createElement('section');
  debugPanel.className = 'debug-console';
  const debugHeader = document.createElement('div');
  debugHeader.className = 'debug-console-header';
  const debugTitle = document.createElement('h4');
  debugTitle.textContent = 'Run code · custom input';
  const debugInput = document.createElement('textarea');
  debugInput.className = 'debug-input';
  debugInput.setAttribute('aria-label', 'Custom input for debugging');
  debugInput.placeholder = 'Enter input here (copy an example input above to try it).';
  debugInput.value = question.examples?.[0]?.input || '';
  const debugOutput = document.createElement('pre');
  debugOutput.className = 'debug-output';
  debugOutput.setAttribute('aria-live', 'polite');
  debugOutput.textContent = 'Program output and errors appear here.';
  const debugButton = document.createElement('button');
  debugButton.type = 'button';
  debugButton.className = 'secondary-button debug-run-button';
  debugButton.textContent = 'Run code';
  debugButton.addEventListener('click', async () => {
    if (!editor.value.trim()) { debugOutput.textContent = 'Write a solution before running it.'; return; }
    debugButton.disabled = true;
    debugButton.textContent = 'Running…';
    debugOutput.textContent = 'Compiling and running your code…';
    const started = performance.now();
    try {
      answerState[question.id] = { language: languageSelect.value, source: editor.value, mode: currentSolutionMode() };
      const result = await postJson('/api/debug-level3', { attemptId: attempt.id, questionId: question.id, language: languageSelect.value, source: editor.value, stdin: debugInput.value, mode: currentSolutionMode() });
      const output = result.stdout || '(no output)';
      const errors = result.compileOutput || result.stderr;
      debugOutput.textContent = `${result.passed ? 'Finished' : result.status}\n\n${errors ? `${errors}\n\n` : ''}Output:\n${output}${result.time ? `\n\nRuntime: ${result.time}s` : ''}`;
      scheduleSave();
    } catch (error) { debugOutput.textContent = error.message; }
    finally {
      debugButton.disabled = false;
      debugButton.textContent = `Run code · ${(performance.now() - started) < 600 ? '<1s' : `${((performance.now() - started) / 1000).toFixed(1)}s`}`;
    }
  });
  debugHeader.append(debugTitle, debugButton);
  debugPanel.append(debugHeader, debugInput, debugOutput);
  codingPane.append(debugPanel);

  const panel = document.createElement('section');
  panel.className = 'test-runner';
  const panelTitle = document.createElement('h4');
  const pubCount = question.publicTests?.length || 2;
  panelTitle.textContent = `Test cases · ${pubCount} public + ${5 - pubCount} hidden`;
  panel.append(panelTitle);
  const list = document.createElement('ol');
  list.className = 'test-case-list';
  const statusItems = [];
  for (let index = 0; index < 5; index += 1) {
    const knownCase = question.publicTests[index];
    const row = document.createElement('li');
    row.className = 'test-case';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = knownCase ? `TC ${index + 1} · ${knownCase.label}` : `TC ${index + 1} · Hidden test`;
    details.append(name);
    if (knownCase) {
      const input = document.createElement('span');
      input.textContent = `Input: ${knownCase.input}`;
      const output = document.createElement('span');
      output.textContent = `Expected: ${knownCase.expected}`;
      details.append(input, output);
    } else {
      const hidden = document.createElement('span');
      hidden.textContent = 'Input and expected output are hidden.';
      details.append(hidden);
    }
    const status = document.createElement('span');
    status.className = 'test-status';
    status.textContent = 'Not run';
    const actualOutput = document.createElement('pre');
    actualOutput.className = 'test-actual-output';
    actualOutput.hidden = true;
    if (knownCase) details.append(actualOutput);
    row.append(details, status);
    list.append(row);
    statusItems.push({ status, actualOutput });
  }
  panel.append(list);
  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'secondary-button run-tests-button';
  runButton.textContent = 'Verify all 5 cases';
  const summary = document.createElement('p');
  summary.className = 'test-summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.textContent = 'Each passed test is worth 5 marks. Hidden test data is not shown.';
  runButton.addEventListener('click', async () => {
    if (!editor.value.trim()) { summary.textContent = 'Write a solution before running tests.'; return; }
    runButton.disabled = true;
    runButton.textContent = 'Verifying…';
    summary.textContent = currentSolutionMode() === 'function'
      ? 'Compiling once, then running your function against all five cases…'
      : 'Running the two examples and three hidden cases in parallel…';
    try {
      answerState[question.id] = { language: languageSelect.value, source: editor.value, mode: currentSolutionMode() };
      const result = await postJson('/api/run-level3', { attemptId: attempt.id, questionId: question.id, language: languageSelect.value, source: editor.value, mode: currentSolutionMode() });
      result.tests.forEach((test, index) => {
        const item = statusItems[index];
        item.status.textContent = test.passed ? `PASS · ${test.marks} marks` : `NOT PASS · ${test.runnerStatus || 'check output'}`;
        item.status.classList.toggle('passed', test.passed);
        item.status.classList.toggle('failed', !test.passed);
        if (test.public && !test.passed) {
          item.actualOutput.hidden = false;
          item.actualOutput.textContent = `${test.detail ? `Runner: ${test.detail}\n` : ''}Your output:\n${test.actual || '(no output)'}`;
        } else {
          item.actualOutput.hidden = true;
          item.actualOutput.textContent = '';
        }
      });
      const passed = result.tests.filter((test) => test.passed).length;
      summary.textContent = `${passed}/5 tests passed · ${result.score}/${result.maxScore} marks for this question.`;
      scheduleSave();
    } catch (error) {
      summary.textContent = error.message;
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Verify all 5 cases';
    }
  });
  panel.append(runButton, summary);
  codingPane.append(panel);
}

function addLevel2TestRunner(question, editor, card) {
  const cases = LEVEL2_TEST_CASES[question.id] || [];
  const panel = document.createElement('section');
  panel.className = 'test-runner';

  let preview = null;
  const updatePreview = () => {
    if (!preview) return;
    preview.srcdoc = editor.value;
  };

  const previewLabel = document.createElement('h4');
  previewLabel.className = 'preview-label';
  previewLabel.textContent = 'Live preview';
  preview = document.createElement('iframe');
  preview.className = 'css-live-preview';
  preview.title = `${question.id === 'traffic-1' ? 'Traffic signal' : question.id === 'water-1' ? 'Water tracker' : 'GMOCS fest card'} preview`;
  preview.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  preview.setAttribute('tabindex', '-1');
  preview.srcdoc = editor.value;
  panel.append(previewLabel, preview);

  editor.addEventListener('input', () => {
    updatePreview();
  });

  const panelTitle = document.createElement('h4');
  panelTitle.textContent = `Test cases · ${cases.length}`;
  panel.append(panelTitle);

  const list = document.createElement('ol');
  list.className = 'test-case-list';
  const statusItems = [];
  for (const [index, [title, expected]] of cases.entries()) {
    const row = document.createElement('li');
    row.className = 'test-case';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `TC ${index + 1} · ${title}`;
    const expectation = document.createElement('span');
    expectation.textContent = `Expected: ${expected}`;
    details.append(name, expectation);
    const status = document.createElement('span');
    status.className = 'test-status';
    status.textContent = 'Not run';
    row.append(details, status);
    list.append(row);
    statusItems.push(status);
  }
  panel.append(list);

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'secondary-button run-tests-button';
  runButton.textContent = 'Run tests';
  const summary = document.createElement('p');
  summary.className = 'test-summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.textContent = 'Run the test cases to check your current code.';

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'Running…';
    summary.textContent = '';
    try {
      const passed = question.id === 'traffic-1'
        ? await runTrafficTests(editor.value, preview)
        : question.id === 'water-1'
          ? await runWaterTests(editor.value, preview)
          : question.id === 'css-1'
            ? await runCssTests(editor.value, preview)
            : runCodeChecks(question.id, editor.value);
      passed.forEach((ok, index) => {
        statusItems[index].textContent = ok ? 'PASS' : 'NOT PASS';
        statusItems[index].classList.toggle('passed', ok);
        statusItems[index].classList.toggle('failed', !ok);
      });
      const totalPassed = passed.filter(Boolean).length;
      const provisionalMarks = totalPassed * 2;
      summary.textContent = totalPassed === cases.length
        ? `All ${cases.length} test cases passed · ${provisionalMarks}/10 provisional marks. You can submit your answer.`
        : `${totalPassed}/${cases.length} test cases passed · ${provisionalMarks}/10 provisional marks. Review your code and run again.`;
    } catch {
      summary.textContent = 'Tests could not run. Check the code and try again.';
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Run tests again';
    }
  });

  // Wire toolbar action buttons
  const runPreviewBtn = card.querySelector('.run-btn');
  if (runPreviewBtn) {
    runPreviewBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      updatePreview();
      summary.textContent = 'Preview updated with latest code. Click "Run tests" to verify test cases.';
      editor.focus();
    });
  }

  const resetBtn = card.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      editor.value = question.code;
      answerState[question.id] = question.code;
      updatePreview();
      statusItems.forEach((status) => {
        status.textContent = 'Not run';
        status.classList.remove('passed', 'failed');
      });
      summary.textContent = 'Code reset to default starter template. Run tests when ready.';
      scheduleSave();
      editor.focus();
    });
  }

  panel.append(runButton, summary);
  card.append(panel);
}

async function runTrafficTests(code, frame) {
  let domResults = null;
  try {
    if (frame) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 800);
        frame.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        frame.srcdoc = code;
      });
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (doc && win) {
        const red = doc.getElementById('red');
        const yellow = doc.getElementById('yellow');
        const green = doc.getElementById('green');
        const button = doc.querySelector('button');

        const isColor = (el, colorName) => {
          if (!el) return false;
          let bg = '';
          try { bg = (win.getComputedStyle(el).backgroundColor || el.style.backgroundColor || el.style.background || '').toLowerCase(); } catch {}
          const cls = (el.className || '').toLowerCase();
          if (colorName === 'red') {
            return bg.includes('rgb(255, 0, 0)') || bg.includes('rgb(255,0,0)') || bg.includes('red') || bg.includes('#f00') || bg.includes('#ff0000') || cls.includes('red');
          }
          if (colorName === 'yellow') {
            return bg.includes('rgb(255, 255, 0)') || bg.includes('rgb(255,255,0)') || bg.includes('yellow') || bg.includes('#ff0') || bg.includes('#ffff00') || cls.includes('yellow');
          }
          if (colorName === 'green') {
            return bg.includes('rgb(0, 128, 0)') || bg.includes('rgb(0, 255, 0)') || bg.includes('rgb(0,128,0)') || bg.includes('rgb(0,255,0)') || bg.includes('green') || bg.includes('#0f0') || bg.includes('#00ff00') || cls.includes('green');
          }
          return false;
        };

        const isRed = () => isColor(red, 'red');
        const isYellow = () => isColor(yellow, 'yellow');
        const isGreen = () => isColor(green, 'green');

        // TC 1: Open page -> Three grey lights appear
        const tc1 = Boolean(red && yellow && green && !isRed() && !isYellow() && !isGreen());

        const clickSignal = () => {
          if (typeof win.changeSignal === 'function') {
            try { win.changeSignal(); } catch {}
          } else if (button) {
            button.click();
          }
        };

        clickSignal();
        const tc2 = isRed() && !isYellow() && !isGreen();

        clickSignal();
        const tc3 = isYellow() && !isRed() && !isGreen();

        clickSignal();
        const tc4 = isGreen() && !isRed() && !isYellow();

        clickSignal();
        const tc5 = isRed() && !isYellow() && !isGreen();

        domResults = [tc1, tc2, tc3, tc4, tc5];
      }
    }
  } catch {
    domResults = null;
  }

  const staticResults = checkTrafficCode(code);
  if (!domResults) return staticResults;
  return domResults.map((r, i) => Boolean(r || staticResults[i]));
}

async function runWaterTests(code, frame) {
  let domResults = null;
  try {
    if (frame) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 800);
        frame.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        frame.srcdoc = code;
      });
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (doc && win) {
        const countEl = doc.getElementById('count');
        const buttons = Array.from(doc.querySelectorAll('button'));
        const drinkBtn = buttons.find((b) => /drink/i.test(b.textContent || '') || /addwater/i.test(b.getAttribute('onclick') || '')) || buttons[0];
        const resetBtn = buttons.find((b) => /reset/i.test(b.textContent || '') || /resetcount/i.test(b.getAttribute('onclick') || '')) || buttons[1];

        const getCount = () => {
          if (!countEl) return -1;
          const val = countEl.textContent ?? countEl.innerText ?? countEl.innerHTML;
          const num = parseInt(String(val).trim(), 10);
          return isNaN(num) ? -1 : num;
        };

        const clickDrink = () => {
          if (typeof win.addWater === 'function') {
            try { win.addWater(); } catch {}
          } else if (drinkBtn) {
            drinkBtn.click();
          }
        };

        const clickReset = () => {
          if (typeof win.resetCount === 'function') {
            try { win.resetCount(); } catch {}
          } else if (resetBtn) {
            resetBtn.click();
          }
        };

        // TC 1: Open page -> Count shows 0
        const tc1 = getCount() === 0;

        // TC 2: Click Drink Water -> Count shows 1
        clickDrink();
        const tc2 = getCount() === 1;

        // TC 3: Click Drink Water twice more -> Count shows 3
        clickDrink();
        clickDrink();
        const tc3 = getCount() === 3;

        // TC 4: Click Reset -> Count returns to 0
        if (countEl) countEl.textContent = '5';
        clickReset();
        const tc4 = getCount() === 0;

        // TC 5: Drink water after reset -> Count shows 1
        clickDrink();
        const tc5 = getCount() === 1;

        domResults = [tc1, tc2, tc3, tc4, tc5];
      }
    }
  } catch {
    domResults = null;
  }

  const staticResults = checkWaterCode(code);
  if (!domResults) return staticResults;
  return domResults.map((r, i) => Boolean(r || staticResults[i]));
}

function checkTrafficCode(code) {
  const norm = String(code || '').toLowerCase().replace(/\s+/g, '');
  const has = (p) => new RegExp(p, 'i').test(norm);
  const tc1 = has('id=["\']?red') && has('id=["\']?yellow') && has('id=["\']?green');

  const bodyMatch = String(code || '').match(/function\s+changeSignal\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
  const body = bodyMatch ? bodyMatch[1].replace(/\/\/[^\n]*/g, '').trim() : '';
  const bodyNorm = body.toLowerCase().replace(/\s+/g, '');
  const bodyHas = (p) => new RegExp(p, 'i').test(bodyNorm);

  const hasChangeSignal = Boolean(body.length > 5);
  const hasSignalInc = bodyHas('signal\\+\\+') || bodyHas('\\+\\+signal') || bodyHas('signal=signal\\+1') || bodyHas('signal\\+=1') || bodyHas('signal%3') || bodyHas('\\(signal\\+1\\)%3');
  const hasRedLogic = bodyHas('red') && (bodyHas('background') || bodyHas('style') || bodyHas('class') || bodyHas('color'));
  const hasYellowLogic = bodyHas('yellow') && (bodyHas('background') || bodyHas('style') || bodyHas('class') || bodyHas('color'));
  const hasGreenLogic = bodyHas('green') && (bodyHas('background') || bodyHas('style') || bodyHas('class') || bodyHas('color'));
  const hasCycleLogic = hasSignalInc || bodyHas('signal=0') || bodyHas('signal=1') || bodyHas('signal%3');

  return [
    tc1,
    hasChangeSignal && hasRedLogic,
    hasChangeSignal && hasYellowLogic,
    hasChangeSignal && hasGreenLogic,
    hasChangeSignal && hasCycleLogic && (hasRedLogic || bodyHas('red')),
  ];
}

function checkWaterCode(code) {
  const norm = String(code || '').toLowerCase().replace(/\s+/g, '');
  const has = (p) => new RegExp(p, 'i').test(norm);
  const tc1 = has('id=["\']?count') && has('>0<');

  const addMatch = String(code || '').match(/function\s+addWater\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
  const addBody = addMatch ? addMatch[1].replace(/\/\/[^\n]*/g, '').trim() : '';
  const addNorm = addBody.toLowerCase().replace(/\s+/g, '');
  const addHas = (p) => new RegExp(p, 'i').test(addNorm);

  const resetMatch = String(code || '').match(/function\s+resetCount\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
  const resetBody = resetMatch ? resetMatch[1].replace(/\/\/[^\n]*/g, '').trim() : '';
  const resetNorm = resetBody.toLowerCase().replace(/\s+/g, '');
  const resetHas = (p) => new RegExp(p, 'i').test(resetNorm);

  const hasIncrement = addHas('glasses\\+\\+') || addHas('\\+\\+glasses') || addHas('glasses\\+=1') || addHas('glasses=glasses\\+1') || addHas('count\\+\\+') || addHas('count\\+=1');
  const hasAddDom = (addHas('textcontent') || addHas('innertext') || addHas('innerhtml')) && addHas('count');
  const tc2 = Boolean(addBody.length > 5 && hasIncrement && hasAddDom);
  const tc3 = tc2;

  const hasReset = resetHas('glasses=0') || resetHas('count=0') || resetHas('textcontent=0') || resetHas('textcontent="0"') || resetHas("textcontent='0'");
  const hasResetDom = (resetHas('textcontent') || resetHas('innertext') || resetHas('innerhtml')) && resetHas('count');
  const tc4 = Boolean(resetBody.length > 5 && hasReset && hasResetDom);
  const tc5 = tc2 && tc4;

  return [tc1, tc2, tc3, tc4, tc5];
}

async function runCssTests(css, frame) {
  if (frame) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 800);
      frame.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
      frame.srcdoc = css;
    });
  }
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;

  let cleanCss = css;
  const styleMatch = css.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) cleanCss = styleMatch[1];

  if (doc && !doc.querySelector('#student-answer-style')) {
    const style = doc.createElement('style');
    style.id = 'student-answer-style';
    style.textContent = cleanCss;
    doc.head?.append(style);
  }

  const containerEl = doc?.querySelector('.container');
  const cardEl = doc?.querySelector('.card');
  const titleEl = doc?.querySelector('.title');
  const roleEl = doc?.querySelector('.role');
  const buttonEl = doc?.querySelector('.btn');

  const container = (containerEl && win) ? win.getComputedStyle(containerEl) : {};
  const card = (cardEl && win) ? win.getComputedStyle(cardEl) : {};
  const title = (titleEl && win) ? win.getComputedStyle(titleEl) : {};
  const role = (roleEl && win) ? win.getComputedStyle(roleEl) : {};
  const button = (buttonEl && win) ? win.getComputedStyle(buttonEl) : {};

  const rgb = (hex) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((part) => part + part).join('') : value;
    return `rgb(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)})`;
  };
  const isFullHeight = Boolean(containerEl && win && Math.abs(containerEl.getBoundingClientRect().height - win.innerHeight) <= 2);
  const normCode = cleanCss.toLowerCase().replace(/\s+/g, '');
  const hasInCss = (p) => new RegExp(p, 'i').test(normCode);

  const isColor333 = (c) => {
    const s = String(c || '').replace(/\s+/g, '').toLowerCase();
    return s.includes('51,51,51') || s.includes('515151') || s.includes('#333') || s.includes('#333333');
  };

  const tc1 = (container.display === 'flex' && (container.justifyContent === 'center' || String(container.justifyContent).includes('center')) && (container.alignItems === 'center' || String(container.alignItems).includes('center')) && isFullHeight)
    || (hasInCss('display:flex') && hasInCss('justify-content:center') && hasInCss('align-items:center') && hasInCss('(?:height|min-height):100vh'));

  const tc2 = ((card.width === '250px' || parseFloat(card.width) === 250) && (card.paddingTop === '20px' || parseFloat(card.paddingTop) === 20) && card.textAlign === 'center')
    || (hasInCss('width:250px') && hasInCss('padding:20px') && hasInCss('text-align:center'));

  const tc3 = ((parseFloat(card.borderTopWidth) === 2 || card.borderTopWidth === '2px') && card.borderTopStyle === 'solid' && (isColor333(card.borderTopColor) || isColor333(card.borderColor)) && (parseFloat(card.borderTopLeftRadius) === 10 || card.borderTopLeftRadius === '10px'))
    || (hasInCss('(?:border:[^;}]*(?:2px|solid|#333)[^;}]*(?:2px|solid|#333)[^;}]*(?:2px|solid|#333)|border-width:2px|border:2pxsolid|border:solid2px)') && hasInCss('border(?:-top-left)?-radius:10px'));

  const tc4 = (title.color === rgb('#1a73e8') && (role.color === rgb('#666666') || String(role.color).includes('102,102,102')) && role.fontStyle === 'italic')
    || (hasInCss('color:#1a73e8') && hasInCss('color:#666') && hasInCss('font-style:italic'));

  const tc5 = (['blue', '#1a73e8', '#007bff', '#00f'].some((color) => button.backgroundColor === (color === 'blue' ? 'rgb(0, 0, 255)' : rgb(color)))
      && button.color === 'rgb(255, 255, 255)' && (button.borderStyle === 'none' || button.borderTopWidth === '0px' || parseFloat(button.borderTopWidth) === 0)
      && (button.borderTopLeftRadius === '5px' || parseFloat(button.borderTopLeftRadius) === 5) && (button.paddingTop === '8px' || parseFloat(button.paddingTop) === 8))
    || (hasInCss('background(?:-color)?:(?:blue|#1a73e8|#007bff|#00f)') && hasInCss('color:white') && hasInCss('border:(?:none|0)') && hasInCss('border-radius:5px') && hasInCss('padding:8px'));

  return [tc1, tc2, tc3, tc4, tc5];
}

function runCodeChecks(questionId, source) {
  const code = source.toLowerCase().replace(/\s+/g, '');
  const has = (pattern) => new RegExp(pattern, 'i').test(code);
  if (questionId === 'express-1') return [
    has("app\\.get\\(['\"]\\/students['\"]") && has('res\\.(?:status\\(200\\)\\.)?json\\('),
    has('req\\.query\\.pass') && has('filter\\(') && has('marks\\s*>=\\s*50'),
    has("app\\.get\\(['\"]\\/students\\/:id['\"]") && has('req\\.params\\.id') && has('status\\(404\\)') && has('notfound'),
    has("app\\.post\\(['\"]\\/students['\"]") && has('students\\.push') && has('status\\(201\\)') && has('(?:students\\.length\\+1|id:4|id:\\s*4|students\\[students\\.length-1\\]\\.id\\+1)'),
    has('(?:name\\.trim|!name|name===|name\\.length|typeofname)') && has('(?:status\\(400\\)|sendstatus\\(400\\))') && has('invaliddata') && has('(?:marks(?:\\)|<|<=|>=|>|!=|==)|<0|<=0|>=0|0>|0<=)') && has('(?:marks(?:\\)|<|<=|>=|>|!=|==)|>100|>=100|<=100|<101|100<|100<=)'),
  ];
  if (questionId === 'react-1') return [
    has('(?:const|let)\\[cart,setcart\\]') && has('usestate') && has('(?:reduce|for|foreach)'),
    has('addtocart') && has('qty:1') && has('setcart'),
    has('addtocart') && has('map\\(') && has('qty') && has('setcart'),
    has('changeqty') && has('filter\\(') && has('qty'),
    has('(?:math\\.min|<5|<=5|>5|5<=|===5)') && has('5') && has('changeqty'),
  ];
  return [];
}

function scheduleSave() {
  clearTimeout(saveHandle);
  saveHandle = setTimeout(() => {
    if (attempt) postJson('/api/save-attempt', { attemptId: attempt.id, answers: answerState }).catch(() => {});
  }, 500);
}

function enterQuiz(data) {
  attempt = data;
  integrityViolationCount = Number(data.integrityViolations || 0);
  integrityEventQueue = Promise.resolve();
  examFullscreenActive = Boolean(document.fullscreenElement);
  answerState = data.answers || {};
  chosenByTask = {};
  for (const task of data.tasks) {
    const saved = task.questions.find((question) => Object.hasOwn(answerState, question.id));
    if (saved) chosenByTask[task.id] = saved.id;
    if (data.level === 2) {
      for (const q of task.questions) {
        if (!answerState[q.id]) answerState[q.id] = q.code;
      }
    }
  }
  $('#quiz-title').textContent = data.level === 3 ? 'Level 3 · Algorithm Challenge' : data.level === 2 ? 'Level 2 · Code Rescue' : 'Level 1 · Bug Smash';
  $('.quiz-topline .level-tag').textContent = `LEVEL ${data.level} · ${{ 1: 'BUG SMASH', 2: 'CODE RESCUE', 3: 'ALGORITHM CHALLENGE' }[data.level]}`;
  $('#quiz-instructions').textContent = data.level === 3
    ? '30 minutes · 2 different questions · choose a supported language · 2 known and 3 hidden tests per question · 5 marks per test.'
    : data.level === 2
      ? 'Three code challenges · 5 tests per question · 2 marks per test · 30 marks total. Run tests before submitting.'
      : signedInUser.studyYear === 1
        ? 'Choose one question in each task and write your fix.'
        : 'One shuffled question from each task has been selected. Answer all four questions; each is worth 5 marks (20 marks total).';
  $('#quiz-message').textContent = '';
  updateIntegrityNotice(examFullscreenActive
    ? `Tab switches are monitored. ${integrityViolationCount} of 3 warnings used.`
    : 'Exam mode is active. Please enter fullscreen and stay on this tab.');
  $('#enter-fullscreen').hidden = examFullscreenActive;
  $('#submit-quiz').disabled = false;
  isPageUnloading = false;
  renderQuestions();
  showView(quizView);
  startTimer();
}

function updateIntegrityNotice(text, visible = true) {
  const notice = $('#integrity-notice');
  if (!notice) return;
  $('#integrity-notice-text').textContent = text;
  notice.hidden = !visible;
}

async function requestExamFullscreen() {
  if (document.fullscreenElement) return true;
  if (!document.documentElement.requestFullscreen) return false;
  try {
    await document.documentElement.requestFullscreen();
    return Boolean(document.fullscreenElement);
  } catch {
    return false;
  }
}

let isPageUnloading = false;
let tabSwitchTimeout = null;

window.addEventListener('beforeunload', () => {
  isPageUnloading = true;
  if (tabSwitchTimeout) clearTimeout(tabSwitchTimeout);
});

window.addEventListener('pagehide', () => {
  isPageUnloading = true;
  if (tabSwitchTimeout) clearTimeout(tabSwitchTimeout);
});

window.addEventListener('unload', () => {
  isPageUnloading = true;
  if (tabSwitchTimeout) clearTimeout(tabSwitchTimeout);
});

window.addEventListener('keydown', (event) => {
  if (
    event.key === 'F5' ||
    ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.key === 'R'))
  ) {
    isPageUnloading = true;
    if (tabSwitchTimeout) clearTimeout(tabSwitchTimeout);
  }
}, true);

async function recordIntegrityViolation(reason) {
  if (isPageUnloading || !attempt || quizView.hidden || $('#submit-quiz').disabled) return;
  const attemptId = attempt.id;
  integrityEventQueue = integrityEventQueue.then(async () => {
    if (isPageUnloading || !attempt || attempt.id !== attemptId || $('#submit-quiz').disabled) return;
    try {
      const result = await postJson('/api/attempt-violation', { attemptId, reason });
      if (isPageUnloading) return;
      integrityViolationCount = result.count;
      if (integrityViolationCount >= 3) {
        updateIntegrityNotice('Third exam-policy violation detected. This level is being submitted automatically.');
        await submitAttempt('tab_switch', true);
        return;
      }
      const label = reason === 'fullscreen_exit' ? 'Fullscreen exit' : 'Tab switch';
      updateIntegrityNotice(`${label} detected (${integrityViolationCount}/3). A third violation will submit this level automatically.`);
    } catch (error) {
      if (!isPageUnloading) {
        updateIntegrityNotice(error.message || 'Could not record this exam warning. Stay on this tab.');
      }
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (isPageUnloading) return;
  if (document.hidden) {
    clearTimeout(tabSwitchTimeout);
    tabSwitchTimeout = setTimeout(() => {
      if (isPageUnloading || !document.hidden) return;
      recordIntegrityViolation('tab_switch');
    }, 300);
  } else {
    clearTimeout(tabSwitchTimeout);
  }
});

document.addEventListener('fullscreenchange', () => {
  if (isPageUnloading) return;
  if (document.fullscreenElement) {
    examFullscreenActive = true;
    $('#enter-fullscreen').hidden = true;
    return;
  }
  setTimeout(() => {
    if (isPageUnloading) return;
    if (!document.fullscreenElement && !document.hidden && examFullscreenActive && attempt && !quizView.hidden && !$('#submit-quiz').disabled) {
      examFullscreenActive = false;
      $('#enter-fullscreen').hidden = false;
      recordIntegrityViolation('fullscreen_exit');
    }
  }, 250);
});

$('#enter-fullscreen').addEventListener('click', async () => {
  const entered = await requestExamFullscreen();
  if (entered) {
    examFullscreenActive = true;
    $('#enter-fullscreen').hidden = true;
    updateIntegrityNotice(`Tab switches are monitored. ${integrityViolationCount} of 3 warnings used.`);
  } else {
    updateIntegrityNotice('Fullscreen could not be enabled. Use a supported browser and stay on this tab.');
  }
});

function startTimer() {
  clearInterval(timerHandle);
  const tick = () => {
    const seconds = Math.max(0, attempt.expiresAt - Math.floor(Date.now() / 1000));
    $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds <= 0) {
      clearInterval(timerHandle);
      submitAttempt('timer', true);
    }
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

function askForLevelPin(level) {
  const dialog = $('#level-pin-dialog');
  const input = $('#level-pin');
  $('#level-pin-title').textContent = `Level ${level} access PIN`;
  $('#level-pin-message').textContent = '';
  input.value = '';
  dialog.dataset.level = String(level);
  dialog.showModal();
  input.focus();
}

async function beginAttempt(requestedLevel = 1, pin = '') {
  const level = Number(requestedLevel);
  const button = level === 3 ? $('#start-level-3') : level === 2 ? $('#start-level-2') : $('#start-level');
  // Request fullscreen directly from the level start gesture.
  const fullscreenPromise = requestExamFullscreen();
  button.disabled = true;
  try {
    const data = await postJson('/api/start-attempt', { level, pin });
    enterQuiz(data);
    const enteredFullscreen = await fullscreenPromise;
    examFullscreenActive = enteredFullscreen;
    $('#enter-fullscreen').hidden = enteredFullscreen;
    updateIntegrityNotice(enteredFullscreen
      ? `Tab switches are monitored. ${integrityViolationCount} of 3 warnings used.`
      : 'Fullscreen could not be enabled. Use the button below, then stay on this tab.');
  } catch (error) {
    await fullscreenPromise;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('#level-details').textContent = error.message;
  } finally {
    $('#level-pin').value = '';
    button.disabled = false;
  }
}

async function resumeAttemptIfAny() {
  try {
    const response = await fetch('/api/attempt');
    if (!response.ok) return;
    const result = await response.json();
    if (!result.attempt) return;
    if (result.attempt.submitted) {
      attempt = result.attempt;
      answerState = result.attempt.answers || {};
      await submitAttempt('timer', true);
    } else if (Number(result.attempt.integrityViolations || 0) >= 3) {
      attempt = result.attempt;
      answerState = result.attempt.answers || {};
      await submitAttempt('tab_switch', true);
    } else {
      enterQuiz(result.attempt);
    }
  } catch {}
}

async function submitAttempt(reason = 'manual', automatic = false) {
  if (!attempt || $('#submit-quiz').disabled) return;
  if (reason === 'manual') {
    const filled = Object.values(answerState).filter((answer) => (typeof answer === 'object' ? String(answer.source || '').trim() : String(answer).trim())).length;
    const requiredAnswers = attempt.tasks.length;
    if (filled < requiredAnswers) {
      $('#quiz-message').textContent = attempt.level === 2
        ? 'Please answer all three Code Rescue questions before submitting.'
        : attempt.level === 3
          ? 'Please write a solution for both Level 3 questions before submitting.'
          : signedInUser.studyYear === 1
            ? 'Choose and answer one question in each task before submitting.'
            : 'Please answer all four questions before submitting.';
      return;
    }
  }
  $('#submit-quiz').disabled = true;
  clearInterval(timerHandle);
  clearTimeout(saveHandle);
  if (tabSwitchTimeout) clearTimeout(tabSwitchTimeout);
  try {
    await postJson('/api/submit-attempt', { attemptId: attempt.id, answers: answerState, reason });
    $('#submitted-message').classList.add('success-message');
    const completionMessage = attempt.level === 1
      ? 'Level 1 successfully completed. Level 1 is now locked and Level 2 is unlocked.'
      : attempt.level === 2
        ? 'Level 2 successfully completed. Level 3 is now unlocked.'
        : 'Level 3 successfully completed. All levels are now locked.';
    $('#submitted-message').textContent = automatic
      ? `Your Level ${attempt.level} attempt was submitted automatically (${reason.replace('_', ' ')}). ${completionMessage}`
      : completionMessage;
    $('#submitted-title').textContent = 'Successfully completed!';
    launchConfetti();
    examFullscreenActive = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showView(submittedView);
  } catch (error) {
    $('#quiz-message').textContent = error.message;
    $('#submit-quiz').disabled = false;
    if (reason !== 'manual') showView(submittedView);
  }
}

function launchConfetti() {
  const container = $('#confetti');
  if (!container) return;
  const colors = ['#f4c542', '#ee6b55', '#3b82c4', '#48a868', '#a56bd4', '#f28ab2'];
  container.replaceChildren();
  for (let i = 0; i < 48; i += 1) {
    const paper = document.createElement('i');
    paper.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / 48 + (Math.random() - 0.5) * 0.35;
    const distance = 75 + Math.random() * 150;
    paper.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    paper.style.setProperty('--dy', `${Math.sin(angle) * distance - 25}px`);
    paper.style.setProperty('--turn', `${Math.random() * 900 - 450}deg`);
    paper.style.setProperty('--delay', `${Math.random() * 180}ms`);
    paper.style.setProperty('--paper-color', colors[i % colors.length]);
    container.append(paper);
  }
}

$('#start-level').addEventListener('click', () => beginAttempt(1));
$('#start-level-2').addEventListener('click', () => askForLevelPin(2));
$('#start-level-3').addEventListener('click', () => askForLevelPin(3));
$('#level-pin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const dialog = $('#level-pin-dialog');
  if (!event.currentTarget.reportValidity()) return;
  const level = Number(dialog.dataset.level);
  const pin = $('#level-pin').value;
  dialog.close();
  await beginAttempt(level, pin);
});
$('#cancel-level-pin').addEventListener('click', () => {
  $('#level-pin').value = '';
  $('#level-pin-dialog').close();
});
$('#submit-quiz').addEventListener('click', () => submitAttempt());
$('#return-dashboard').addEventListener('click', async () => {
  attempt = null;
  $('#submit-quiz').disabled = false;
  await refreshLevelAccess();
  showView(dashboardView);
});
$('#sign-out').addEventListener('click', async () => {
  await signOutStudent();
});
$('#quiz-sign-out').addEventListener('click', signOutStudent);
$('#result-sign-out').addEventListener('click', signOutStudent);

(async function restoreSession() {
  try {
    const adminResponse = await fetch('/api/admin/me');
    const admin = await adminResponse.json();
    if (admin.authenticated) { showView(adminView); await refreshAdminDashboard(); return; }
    const response = await fetch('/api/me');
    const user = await response.json();
    if (user.authenticated) {
      showDashboard(user);
      await resumeAttemptIfAny();
    }
  } catch {}
})();
