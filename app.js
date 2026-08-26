/* ================= 教务管理系统 app.js ================= */

const SUPABASE_URL = 'https://kgekkxqbjxhltmjckdam.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bmOF5PN2EwvUtlAnU6ZFYg_7sW_gM4V';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ---------- REST 封装 ---------- */
async function api(path, opts = {}) {
  const { method = 'GET', body, params = '' } = opts;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  if (method === 'POST' || method === 'PATCH') headers['Prefer'] = 'return=representation';
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path + params, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const e = await res.json(); msg = e.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- 工具函数 ---------- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDate(s) {
  if (!s) return '';
  const p = s.split('-');
  return p.length === 3 ? p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日' : s;
}
function fmtTime(t) {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const STATUS_NAMES = { normal: '正常', late: '迟到', leave: '请假', absent: '缺勤' };
const STATUS_BADGE = { normal: 'badge-green', late: 'badge-orange', leave: 'badge-blue', absent: 'badge-red' };
const IMP_NAMES = { high: '高', medium: '中', low: '低' };
const IMP_CLS = { high: 'badge-red', medium: 'badge-orange', low: 'badge-gray' };

/* ---------- 状态 ---------- */
const state = { students: [], courses: [], attendance: [], scores: [], plans: [] };
let courseFilter = 'future';

async function loadAll() {
  const [s, c, a, sc, p] = await Promise.all([
    api('students?select=*&order=name.asc'),
    api('courses?select=*&order=course_date.asc,start_time.asc'),
    api('attendance?select=*&order=signed_at.desc'),
    api('scores?select=*&order=exam_date.asc,created_at.asc'),
    api('plans?select=*&order=created_at.asc'),
  ]);
  state.students = s || [];
  state.courses = c || [];
  state.attendance = a || [];
  state.scores = sc || [];
  state.plans = p || [];
}
function studentById(id) { return state.students.find(x => x.id === id); }
function attendanceOf(courseId) { return state.attendance.find(x => x.course_id === courseId); }

/* ---------- 登录 ---------- */
async function initAuth() {
  try {
    const rows = await api('settings?key=eq.password&select=value');
    if (!rows.length) { $('#login-set').style.display = 'block'; $('#login-enter').style.display = 'none'; }
    else if (localStorage.getItem('jw_login') === '1') enterApp();
    else { $('#login-set').style.display = 'none'; $('#login-enter').style.display = 'block'; }
  } catch (e) {
    alert('连接云端数据库失败：' + e.message + '\n\n请确认：\n1. 网络能正常上网\n2. 已按步骤在 Supabase 里运行建表 SQL');
  }
}
async function setPassword() {
  const p1 = $('#set-pwd1').value, p2 = $('#set-pwd2').value;
  if (!p1 || p1.length < 4) return alert('密码至少 4 位');
  if (p1 !== p2) return alert('两次输入的密码不一致');
  try {
    const hash = await sha256(p1);
    await api('settings', { method: 'POST', body: { key: 'password', value: hash } });
    localStorage.setItem('jw_login', '1');
    enterApp();
  } catch (e) { alert('设置失败：' + e.message); }
}
async function doLogin() {
  const p = $('#login-pwd').value;
  if (!p) return alert('请输入密码');
  try {
    const hash = await sha256(p);
    const rows = await api('settings?key=eq.password&select=value');
    if (rows.length && rows[0].value === hash) {
      localStorage.setItem('jw_login', '1');
      enterApp();
    } else alert('密码错误');
  } catch (e) { alert('登录失败：' + e.message); }
}
function logout() {
  localStorage.removeItem('jw_login');
  location.reload();
}
async function enterApp() {
  $('#login-view').style.display = 'none';
  $('#app-view').style.display = 'block';
  try {
    await loadAll();
  } catch (e) {
    alert('加载数据失败：' + e.message);
  }
  showPage('home');
}

/* ---------- 页面切换 ---------- */
function showPage(name) {
  $$('.page').forEach(el => el.style.display = 'none');
  $('#page-' + name).style.display = 'block';
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'home') renderHome();
  else if (name === 'students') renderStudents();
  else if (name === 'courses') renderCourses();
  else if (name === 'attendance') renderAttendance();
  else if (name === 'plans') renderPlans();
}

/* ---------- 弹窗 ---------- */
function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').style.display = 'flex';
}
function closeModal() { $('#modal').style.display = 'none'; }

/* ================= 首页 ================= */
function renderHome() {
  const today = todayStr();
  $('#home-today').textContent = fmtDate(today);
  const todayCourses = state.courses.filter(c => c.course_date === today);
  const unchecked = todayCourses.filter(c => !attendanceOf(c.id));
  const pending = state.plans.filter(p => p.status !== 'done');
  const overdue = pending.filter(p => p.due_date && p.due_date < today);
  const low = state.students.filter(s => (s.remaining_lessons || 0) <= 2);

  $('#home-stats').innerHTML =
    '<div class="stat-card"><div class="stat-num">' + state.students.length + '</div><div class="stat-label">👦 在管学生</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + todayCourses.length + '</div><div class="stat-label">📅 今日课程</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + unchecked.length + '</div><div class="stat-label">✅ 待签到</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + pending.length + (overdue.length ? '<span style="font-size:13px;color:#d64545">(' + overdue.length + '到期)</span>' : '') + '</div><div class="stat-label">📝 待办事项</div></div>';

  if (!todayCourses.length) {
    $('#home-today-courses').innerHTML = '<div class="empty">今天没有排课 🎉</div>';
  } else {
    $('#home-today-courses').innerHTML = todayCourses.map(c => {
      const stu = studentById(c.student_id);
      const att = attendanceOf(c.id);
      const badge = att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '<span class="badge badge-gray">未签到</span>';
      return '<div class="course-row">' +
        '<div class="course-time">' + fmtTime(c.start_time) + '</div>' +
        '<div class="course-info"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + '</div></div>' + badge + '</div>';
    }).join('');
  }

  if (!low.length) {
    $('#home-low-lessons').innerHTML = '<div class="empty">暂无课时不足的学生</div>';
  } else {
    $('#home-low-lessons').innerHTML = low.map(s =>
      '<div class="list-item"><div class="list-main"><div class="list-title">' + esc(s.name) + ' · ' + esc(s.subjects || '') + '</div>' +
      '<div class="list-sub">' + esc(s.parent_phone || '') + '</div></div>' +
      '<span class="badge ' + (s.remaining_lessons <= 0 ? 'badge-red' : 'badge-orange') + '">剩 ' + (s.remaining_lessons || 0) + ' 节</span></div>'
    ).join('');
  }

  if (!pending.length) {
    $('#home-plans').innerHTML = '<div class="empty">暂无待办事项</div>';
  } else {
    const sorted = pending.slice().sort((a, b) => impRank(a) - impRank(b) || (a.due_date || '').localeCompare(b.due_date || ''));
    $('#home-plans').innerHTML = sorted.slice(0, 6).map(p =>
      '<div class="list-item"><div class="list-main"><div class="list-title' + (p.due_date && p.due_date < today ? ' over' : '') + '">' + esc(p.title) + '</div>' +
      '<div class="list-sub">' + (p.due_date ? '截止 ' + fmtDate(p.due_date) : '无截止日期') + '</div></div>' +
      '<span class="badge ' + IMP_CLS[p.importance] + '">' + IMP_NAMES[p.importance] + '重要</span></div>'
    ).join('');
  }
}

/* ================= 学生档案 ================= */
function renderStudents() {
  const kw = $('#stu-search').value.trim().toLowerCase();
  const list = state.students.filter(s =>
    !kw || (s.name || '').toLowerCase().includes(kw) || (s.subjects || '').toLowerCase().includes(kw)
  );
  if (!list.length) {
    $('#stu-list').innerHTML = '<div class="card"><div class="empty">' + (kw ? '没有找到匹配的学生' : '还没有学生，点右上角"＋ 建档"添加第一位学生吧') + '</div></div>';
    return;
  }
  $('#stu-list').innerHTML = list.map(s =>
    '<div class="card" style="cursor:pointer" onclick="openStudentDetail(' + s.id + ')">' +
    '<div class="list-item"><div class="list-main"><div class="list-title">' + esc(s.name) +
    ' <span class="badge badge-blue">' + esc(s.grade || '') + '</span></div>' +
    '<div class="list-sub">' + esc(s.subjects || '未填科目') + ' · ' + esc(s.teacher || '') + '</div></div>' +
    '<span class="badge ' + ((s.remaining_lessons || 0) <= 2 ? 'badge-red' : 'badge-green') + '">剩 ' + (s.remaining_lessons || 0) + '/' + (s.total_lessons || 0) + ' 节</span></div></div>'
  ).join('');
}

function openStudentForm(id) {
  const s = id ? studentById(id) : null;
  const f = id ? s : { name: '', grade: '', subjects: '', teacher: '', school: '', birthday: '', parent_phone: '', enroll_date: todayStr(), total_lessons: 0, notes: '' };
  openModal(id ? '编辑学生' : '学生建档', `
    <div class="form-row"><label>姓名 *</label><input id="f-name" type="text" value="${esc(f.name)}"></div>
    <div class="form-grid">
      <div class="form-row"><label>年级</label><input id="f-grade" type="text" value="${esc(f.grade)}"></div>
      <div class="form-row"><label>报读科目</label><input id="f-subjects" type="text" value="${esc(f.subjects)}" placeholder="如：数学、英语"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>任课老师</label><input id="f-teacher" type="text" value="${esc(f.teacher)}"></div>
      <div class="form-row"><label>学校</label><input id="f-school" type="text" value="${esc(f.school)}"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>学生生日</label><input id="f-birthday" type="date" value="${esc(f.birthday)}"></div>
      <div class="form-row"><label>报名时间</label><input id="f-enroll" type="date" value="${esc(f.enroll_date)}"></div>
    </div>
    <div class="form-row"><label>家长电话</label><input id="f-phone" type="tel" value="${esc(f.parent_phone)}"></div>
    <div class="form-row"><label>报读课时数（总节数）</label><input id="f-total" type="number" min="0" value="${f.total_lessons || 0}"></div>
    <div class="form-row"><label>备注</label><textarea id="f-notes" rows="2">${esc(f.notes)}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveStudent(${id || 'null'})">保存</button>
  `);
}
async function saveStudent(id) {
  const data = {
    name: $('#f-name').value.trim(),
    grade: $('#f-grade').value.trim(),
    subjects: $('#f-subjects').value.trim(),
    teacher: $('#f-teacher').value.trim(),
    school: $('#f-school').value.trim(),
    birthday: $('#f-birthday').value,
    parent_phone: $('#f-phone').value.trim(),
    enroll_date: $('#f-enroll').value,
    total_lessons: Number($('#f-total').value) || 0,
    notes: $('#f-notes').value.trim(),
  };
  if (!data.name) return alert('请填写学生姓名');
  try {
    if (id) {
      await api('students?id=eq.' + id, { method: 'PATCH', body: data });
    } else {
      data.remaining_lessons = data.total_lessons;
      await api('students', { method: 'POST', body: data });
    }
    await loadAll();
    closeModal();
    renderStudents();
  } catch (e) { alert('保存失败：' + e.message); }
}

function openStudentDetail(id) {
  const s = studentById(id);
  if (!s) return;
  const myAtt = state.attendance.filter(a => a.student_id === id);
  const used = myAtt.filter(a => ['normal', 'late', 'absent'].includes(a.status)).length;
  const myCourses = state.courses.filter(c => c.student_id === id).sort((a, b) => (b.course_date + (b.start_time || '')).localeCompare(a.course_date + (a.start_time || '')));

  let historyHtml = '';
  if (!myCourses.length) historyHtml = '<div class="empty">暂无上课记录</div>';
  else historyHtml = myCourses.slice(0, 20).map(c => {
    const att = attendanceOf(c.id);
    return '<div class="att-row"><div style="min-width:84px;font-weight:600">' + fmtDate(c.course_date) + '</div>' +
      '<div class="muted" style="min-width:44px">' + fmtTime(c.start_time) + '</div>' +
      '<div style="flex:1">' + esc(c.subject || '') + ' · ' + esc(c.teacher || '') + '</div>' +
      (att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '<span class="badge badge-gray">未签到</span>') + '</div>';
  }).join('');

  const subjects = [...new Set(state.scores.filter(x => x.student_id === id).map(x => x.subject).filter(Boolean))];
  let chartsHtml = '';
  if (!subjects.length) chartsHtml = '<div class="empty">还没有考试成绩，点击下方"添加成绩"</div>';
  else {
    chartsHtml = subjects.map(sub => {
      const pts = state.scores.filter(x => x.student_id === id && x.subject === sub);
      return '<div class="chart-title">📈 ' + esc(sub) + ' 成绩趋势</div>' +
        '<div class="chart-box"><canvas id="chart-' + id + '-' + esc(sub) + '" data-sub="' + esc(sub) + '"></canvas></div>';
    }).join('');
  }

  openModal(esc(s.name) + ' 的档案', `
    <div class="card" style="box-shadow:none;padding:0">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">${esc(s.name)} <span class="badge badge-blue">${esc(s.grade || '')}</span></div>
          <div class="list-sub">科目：${esc(s.subjects || '')} ｜ 老师：${esc(s.teacher || '')}</div>
          <div class="list-sub">学校：${esc(s.school || '')} ｜ 生日：${esc(s.birthday || '')}</div>
          <div class="list-sub">家长电话：${esc(s.parent_phone || '')} ｜ 报名：${esc(s.enroll_date || '')}</div>
          <div class="list-sub">课时：已用 ${used} 节 ｜ 剩余 <b style="color:${(s.remaining_lessons||0) <= 2 ? '#d64545' : '#1d9d5a'}">${s.remaining_lessons || 0}</b> / ${s.total_lessons || 0} 节</div>
          ${s.notes ? '<div class="list-sub">备注：' + esc(s.notes) + '</div>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-gray btn-sm" onclick="openStudentForm(${id})">✏️ 编辑</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStudent(${id})">🗑 删除</button>
      </div>
    </div>
    <div class="section-title">📊 成绩趋势</div>
    ${chartsHtml}
    <button class="btn btn-primary btn-block" style="margin-top:8px" onclick="openScoreForm(${id})">＋ 添加考试成绩</button>
    <div class="section-title">🗓 上课记录</div>
    ${historyHtml}
  `);
  setTimeout(() => {
    subjects.forEach(sub => {
      const pts = state.scores.filter(x => x.student_id === id && x.subject === sub);
      const cv = document.getElementById('chart-' + id + '-' + sub);
      if (cv) drawLineChart(cv, pts.map(p => ({ label: p.exam_date ? p.exam_date.slice(5) : p.exam_name, value: Number(p.score), name: p.exam_name })));
    });
  }, 50);
}

function openScoreForm(studentId) {
  openModal('添加考试成绩', `
    <div class="form-grid">
      <div class="form-row"><label>科目 *</label><input id="sc-sub" type="text" placeholder="如：数学"></div>
      <div class="form-row"><label>分数 *</label><input id="sc-score" type="number" min="0" max="150" placeholder="如：92"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>考试名称</label><input id="sc-name" type="text" placeholder="如：期中考试"></div>
      <div class="form-row"><label>考试日期</label><input id="sc-date" type="date" value="${todayStr()}"></div>
    </div>
    <button class="btn btn-primary btn-block" onclick="saveScore(${studentId})">保存成绩</button>
  `);
}
async function saveScore(studentId) {
  const sub = $('#sc-sub').value.trim(), score = Number($('#sc-score').value);
  if (!sub) return alert('请填写科目');
  if (!score && score !== 0) return alert('请填写分数');
  try {
    await api('scores', { method: 'POST', body: { student_id: studentId, subject: sub, score, exam_name: $('#sc-name').value.trim(), exam_date: $('#sc-date').value } });
    await loadAll();
    closeModal();
    openStudentDetail(studentId);
  } catch (e) { alert('保存失败：' + e.message); }
}

async function deleteStudent(id) {
  if (!confirm('确定删除该学生吗？他的排课、签到、成绩记录会一并删除，无法恢复！')) return;
  try {
    await api('students?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    closeModal();
    renderStudents();
  } catch (e) { alert('删除失败：' + e.message); }
}

/* ---------- 折线图（纯 Canvas，无外部依赖） ---------- */
function drawLineChart(canvas, pts) {
  if (!pts || pts.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 300, H = 190;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const padL = 34, padR = 12, padT = 12, padB = 26;
  const cw = W - padL - padR, ch = H - padT - padB;
  const vals = pts.map(p => p.value);
  const minV = Math.max(0, Math.min(...vals) - 5);
  const maxV = Math.min(1000, Math.max(...vals) + 5);
  const y = v => padT + ch - ((v - minV) / (maxV - minV || 1)) * ch;
  const x = i => pts.length === 1 ? padL + cw / 2 : padL + (cw * i) / (pts.length - 1);

  ctx.clearRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = '#f0f0f0'; ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = minV + ((maxV - minV) * g) / 4;
    const yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(Math.round(v), padL - 5, yy + 3);
  }
  // 折线
  ctx.strokeStyle = '#2b6de8'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
  pts.forEach((p, i) => { i === 0 ? ctx.moveTo(x(i), y(p.value)) : ctx.lineTo(x(i), y(p.value)); });
  ctx.stroke();
  // 点 + 值
  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(p.value), 3.5, 0, Math.PI * 2); ctx.fillStyle = '#2b6de8'; ctx.fill();
    ctx.fillStyle = '#333'; ctx.textAlign = 'center';
    ctx.fillText(String(p.value), x(i), y(p.value) - 8);
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif';
    ctx.fillText(String(p.label || ''), x(i), H - 8);
  });
  // 分数点的考试名（悬浮 title 用 data 已在调用处给 name）
  canvas.title = pts.map(p => p.name + '：' + p.value).join('，');
}

/* ================= 排课 ================= */
function openCourseForm() {
  if (!state.students.length) { alert('请先到"学生"页面建档，再添加课程'); return; }
  const opts = state.students.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
  openModal('添加课程', `
    <div class="form-row"><label>学生 *</label><select id="c-stu">${opts}</select></div>
    <div class="form-grid">
      <div class="form-row"><label>科目 *</label><input id="c-sub" type="text" placeholder="如：数学"></div>
      <div class="form-row"><label>老师</label><input id="c-teacher" type="text" placeholder="如：王老师"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>上课日期 *</label><input id="c-date" type="date" value="${todayStr()}"></div>
      <div class="form-row"><label>开始时间 *</label><input id="c-start" type="time" value="18:00"></div>
    </div>
    <div class="form-row"><label>结束时间（选填）</label><input id="c-end" type="time"></div>
    <div class="form-row" style="display:flex;align-items:center;gap:8px">
      <input id="c-repeat" type="checkbox" style="width:auto" onchange="document.getElementById('c-weeks').style.display=this.checked?'block':'none'">
      <label style="margin:0">每周固定循环上课（排一次，自动生成未来几周）</label>
    </div>
    <div class="form-row" id="c-weeks" style="display:none">
      <label>持续几周（生成几节课）</label>
      <input id="c-weeknum" type="number" min="1" max="20" value="8">
    </div>
    <button class="btn btn-primary btn-block" onclick="saveCourse()">保存课程</button>
  `);
  const sel = $('#c-stu');
  const stu = studentById(Number(sel.value));
  if (stu) { $('#c-sub').value = (stu.subjects || '').split(/[,，、]/)[0] || ''; $('#c-teacher').value = stu.teacher || ''; }
  sel.onchange = () => {
    const s2 = studentById(Number(sel.value));
    if (s2) { $('#c-sub').value = (s2.subjects || '').split(/[,，、]/)[0] || ''; $('#c-teacher').value = s2.teacher || ''; }
  };
}
async function saveCourse() {
  const studentId = Number($('#c-stu').value);
  const subject = $('#c-sub').value.trim();
  const start = $('#c-start').value;
  const date = $('#c-date').value;
  if (!studentId) return alert('请选择学生');
  if (!subject) return alert('请填写科目');
  if (!date) return alert('请选择日期');
  if (!start) return alert('请选择开始时间');
  const teacher = $('#c-teacher').value.trim();
  const end = $('#c-end').value;
  const repeat = $('#c-repeat').checked;
  const weeks = repeat ? Math.min(20, Math.max(1, Number($('#c-weeknum').value) || 8)) : 1;
  const rows = [];
  const seriesId = repeat ? 's' + Date.now() : null;
  const base = new Date(date + 'T00:00:00');
  for (let i = 0; i < weeks; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    rows.push({ student_id: studentId, subject, teacher, course_date: ds, start_time: start, end_time: end, series_id: seriesId });
  }
  try {
    await api('courses', { method: 'POST', body: rows });
    await loadAll();
    closeModal();
    renderCourses();
    alert(repeat ? '已生成未来 ' + weeks + ' 周的课程' : '课程已添加');
  } catch (e) { alert('保存失败：' + e.message); }
}

function setCourseFilter(f) {
  courseFilter = f;
  $('#tab-future').classList.toggle('active', f === 'future');
  $('#tab-all').classList.toggle('active', f === 'all');
  renderCourses();
}
function renderCourses() {
  const today = todayStr();
  let list = state.courses.slice();
  if (courseFilter === 'future') list = list.filter(c => c.course_date >= today);
  if (!list.length) {
    $('#course-list').innerHTML = '<div class="card"><div class="empty">' + (courseFilter === 'future' ? '未来没有排课，点上方"＋ 添加课程"排课吧' : '还没有任何课程') + '</div></div>';
    return;
  }
  const byDate = {};
  list.forEach(c => { (byDate[c.course_date] = byDate[c.course_date] || []).push(c); });
  const dates = Object.keys(byDate).sort();
  $('#course-list').innerHTML = dates.map(d => {
    const items = byDate[d].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).map(c => {
      const stu = studentById(c.student_id);
      const att = attendanceOf(c.id);
      return '<div class="course-row">' +
        '<div class="course-time">' + fmtTime(c.start_time) + '</div>' +
        '<div class="course-info"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + (c.series_id ? ' 🔁循环' : '') + '</div></div>' +
        (att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '') +
        '<button class="btn btn-danger btn-sm" onclick="deleteCourse(' + c.id + ', ' + (c.series_id ? 'true' : 'false') + ')">删</button></div>';
    }).join('');
    return '<div class="day-group">📆 ' + fmtDate(d) + (d === today ? ' <span class="badge badge-blue">今天</span>' : '') + (d < today ? ' <span class="badge badge-gray">已过</span>' : '') + '</div>' + items;
  }).join('');
}
async function deleteCourse(id, isSeries) {
  const c = studentById(state.courses.find(x => x.id === id)?.student_id);
  let msg = '确定删除这节课吗？\n（已签到的记录也会删除）';
  if (isSeries) msg = '这是循环课中的一节。\n确定删除这节课吗？（只删这一节，不影响其他周）';
  if (!confirm(msg)) return;
  try {
    await api('courses?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    renderCourses();
    if (c) await recalcLesson(c.id);
  } catch (e) { alert('删除失败：' + e.message); }
}

/* ================= 签到 ================= */
function renderAttendance() {
  const dateInput = $('#att-date');
  if (!dateInput.value) dateInput.value = todayStr();
  const date = dateInput.value;
  const list = state.courses.filter(c => c.course_date === date).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  if (!list.length) {
    $('#att-list').innerHTML = '<div class="card"><div class="empty">这一天没有排课</div></div>';
  } else {
    $('#att-list').innerHTML = list.map(c => {
      const stu = studentById(c.student_id);
      const att = attendanceOf(c.id);
      const btn = (s, name) => '<button class="sign-btn' + (att && att.status === s ? ' active' : '') + '" data-s="' + s + '" onclick="signCourse(' + c.id + ', \'' + s + '\')">' + name + '</button>';
      return '<div class="course-row" style="align-items:flex-start;flex-wrap:wrap">' +
        '<div class="course-time">' + fmtTime(c.start_time) + '</div>' +
        '<div class="course-info" style="flex-basis:calc(100% - 110px)"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + '</div></div>' +
        '<div class="sign-btns" style="width:100%;margin-top:4px;padding-left:0">' + btn('normal', '✅ 正常') + btn('late', '⏰ 迟到') + btn('leave', '💤 请假') + btn('absent', '🚫 缺勤') + '</div></div>';
    }).join('');
  }

  // 当天签到记录
  const recs = state.attendance.filter(a => a.course_date === date).sort((a, b) => (a.signed_at || '').localeCompare(b.signed_at || ''));
  $('#att-records').innerHTML = !recs.length
    ? '<div class="card"><div class="empty">当天还没有签到记录</div></div>'
    : '<div class="card">' + recs.map(a => {
      const stu = studentById(a.student_id);
      return '<div class="att-row"><div style="flex:1">' + (stu ? esc(stu.name) : '?') + '</div>' +
        '<span class="badge ' + STATUS_BADGE[a.status] + '">' + STATUS_NAMES[a.status] + '</span>' +
        '<span class="muted">' + (a.signed_at ? a.signed_at.slice(11, 16) : '') + '</span></div>';
    }).join('') + '</div>';

  // 历史记录（最近 60 条）
  const hist = state.attendance.filter(a => a.course_date !== date).slice(0, 60);
  $('#att-history').innerHTML = !hist.length
    ? '<div class="card"><div class="empty">暂无历史记录</div></div>'
    : '<div class="card">' + hist.map(a => {
      const stu = studentById(a.student_id);
      return '<div class="att-row"><div style="min-width:84px;font-weight:600">' + fmtDate(a.course_date) + '</div>' +
        '<div style="flex:1">' + (stu ? esc(stu.name) : '?') + '</div>' +
        '<span class="badge ' + STATUS_BADGE[a.status] + '">' + STATUS_NAMES[a.status] + '</span>' +
        '<span class="muted">' + (a.signed_at ? a.signed_at.slice(11, 16) : '') + '</span></div>';
    }).join('') + '</div>';
}

async function signCourse(courseId, status) {
  const c = state.courses.find(x => x.id === courseId);
  if (!c) return;
  const existing = attendanceOf(courseId);
  try {
    if (existing) {
      await api('attendance?id=eq.' + existing.id, { method: 'PATCH', body: { status, signed_at: new Date().toISOString() } });
    } else {
      await api('attendance', { method: 'POST', body: { course_id: courseId, student_id: c.student_id, course_date: c.course_date, status } });
    }
    await loadAll();
    await recalcLesson(c.student_id);
    renderAttendance();
  } catch (e) { alert('签到失败：' + e.message); }
}
async function recalcLesson(studentId) {
  const stu = studentById(studentId);
  if (!stu) return;
  const atts = state.attendance.filter(a => a.student_id === studentId);
  const used = atts.filter(a => ['normal', 'late', 'absent'].includes(a.status)).length;
  const remaining = Math.max(0, (stu.total_lessons || 0) - used);
  try {
    await api('students?id=eq.' + studentId, { method: 'PATCH', body: { remaining_lessons: remaining } });
    stu.remaining_lessons = remaining;
  } catch (e) {}
}

/* ================= 工作计划 ================= */
function impRank(p) { return p.importance === 'high' ? 0 : p.importance === 'medium' ? 1 : 2; }
function openPlanForm() {
  openModal('添加工作计划', `
    <div class="form-row"><label>计划内容 *</label><input id="p-title" type="text" placeholder="如：本周给家长反馈学生情况"></div>
    <div class="form-grid">
      <div class="form-row"><label>截止日期</label><input id="p-date" type="date" value="${todayStr()}"></div>
      <div class="form-row"><label>重要程度</label>
        <select id="p-imp">
          <option value="high">🔴 高</option>
          <option value="medium" selected>🟠 中</option>
          <option value="low">⚪ 低</option>
        </select>
      </div>
    </div>
    <button class="btn btn-primary btn-block" onclick="savePlan()">保存计划</button>
  `);
}
async function savePlan() {
  const title = $('#p-title').value.trim();
  if (!title) return alert('请填写计划内容');
  try {
    await api('plans', { method: 'POST', body: { title, due_date: $('#p-date').value, importance: $('#p-imp').value, status: 'pending' } });
    await loadAll();
    closeModal();
    renderPlans();
  } catch (e) { alert('保存失败：' + e.message); }
}
function renderPlans() {
  const today = todayStr();
  const pending = state.plans.filter(p => p.status !== 'done').sort((a, b) => impRank(a) - impRank(b) || (a.due_date || '').localeCompare(b.due_date || ''));
  const done = state.plans.filter(p => p.status === 'done');
  $('#plan-pending').innerHTML = !pending.length
    ? '<div class="empty">暂无待完成计划</div>'
    : pending.map(p =>
      '<div class="plan-item"><button class="plan-check" onclick="togglePlan(' + p.id + ')">✓</button>' +
      '<div class="plan-title' + (p.due_date && p.due_date < today ? ' over' : '') + '">' + esc(p.title) + '<div class="muted">' + (p.due_date ? '截止 ' + fmtDate(p.due_date) + (p.due_date < today ? ' ⚠️已过期' : '') : '无截止日期') + '</div></div>' +
      '<span class="badge ' + IMP_CLS[p.importance] + '">' + IMP_NAMES[p.importance] + '</span>' +
      '<button class="btn btn-danger btn-sm" onclick="deletePlan(' + p.id + ')">删</button></div>'
    ).join('');
  $('#plan-done').innerHTML = !done.length
    ? '<div class="empty">还没有完成的计划</div>'
    : done.map(p =>
      '<div class="plan-item"><button class="plan-check done" onclick="togglePlan(' + p.id + ')">✓</button>' +
      '<div class="plan-title finished">' + esc(p.title) + '</div>' +
      '<button class="btn btn-danger btn-sm" onclick="deletePlan(' + p.id + ')">删</button></div>'
    ).join('');
}
async function togglePlan(id) {
  const p = state.plans.find(x => x.id === id);
  if (!p) return;
  try {
    await api('plans?id=eq.' + id, { method: 'PATCH', body: { status: p.status === 'done' ? 'pending' : 'done' } });
    await loadAll();
    renderPlans();
    renderHome();
  } catch (e) { alert('操作失败：' + e.message); }
}
async function deletePlan(id) {
  if (!confirm('确定删除这条计划吗？')) return;
  try {
    await api('plans?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    renderPlans();
    renderHome();
  } catch (e) { alert('删除失败：' + e.message); }
}

/* ---------- 启动 ---------- */
initAuth();
