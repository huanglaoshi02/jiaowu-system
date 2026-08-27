/* ================= 黄老师工作台 app.js ================= */

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
const CARE_STATUS_NAMES = { normal: '已到', leave: '请假', absent: '未到' };
const CARE_TYPE_NAMES = { da: '大班晚托', two: '两人晚托', eight: '八人晚托' };
const CARE_TYPE_BADGE = { da: 'badge-purple', two: 'badge-blue', eight: 'badge-orange' };
const IMP_NAMES = { high: '高', medium: '中', low: '低' };
const IMP_CLS = { high: 'badge-red', medium: 'badge-orange', low: 'badge-gray' };

/* ---------- 2026 年官方节假日（国务院办公厅公布，自动标注） ---------- */
const OFFICIAL_HOLIDAYS = {
  '2026-01-01': { name: '元旦', type: 'festival' }, '2026-01-02': { name: '休', type: 'festival' }, '2026-01-03': { name: '休', type: 'festival' }, '2026-01-04': { name: '班', type: 'workday' },
  '2026-02-14': { name: '班', type: 'workday' },
  '2026-02-15': { name: '春节', type: 'festival' }, '2026-02-16': { name: '休', type: 'festival' }, '2026-02-17': { name: '休', type: 'festival' }, '2026-02-18': { name: '休', type: 'festival' }, '2026-02-19': { name: '休', type: 'festival' }, '2026-02-20': { name: '休', type: 'festival' }, '2026-02-21': { name: '休', type: 'festival' }, '2026-02-22': { name: '休', type: 'festival' }, '2026-02-23': { name: '休', type: 'festival' },
  '2026-02-28': { name: '班', type: 'workday' },
  '2026-04-04': { name: '清明节', type: 'festival' }, '2026-04-05': { name: '休', type: 'festival' }, '2026-04-06': { name: '休', type: 'festival' },
  '2026-05-01': { name: '劳动节', type: 'festival' }, '2026-05-02': { name: '休', type: 'festival' }, '2026-05-03': { name: '休', type: 'festival' }, '2026-05-04': { name: '休', type: 'festival' }, '2026-05-05': { name: '休', type: 'festival' },
  '2026-05-09': { name: '班', type: 'workday' },
  '2026-06-19': { name: '端午节', type: 'festival' }, '2026-06-20': { name: '休', type: 'festival' }, '2026-06-21': { name: '休', type: 'festival' },
  '2026-09-20': { name: '班', type: 'workday' },
  '2026-09-25': { name: '中秋节', type: 'festival' }, '2026-09-26': { name: '休', type: 'festival' }, '2026-09-27': { name: '休', type: 'festival' },
  '2026-10-01': { name: '国庆节', type: 'festival' }, '2026-10-02': { name: '休', type: 'festival' }, '2026-10-03': { name: '休', type: 'festival' }, '2026-10-04': { name: '休', type: 'festival' }, '2026-10-05': { name: '休', type: 'festival' }, '2026-10-06': { name: '休', type: 'festival' }, '2026-10-07': { name: '休', type: 'festival' },
  '2026-10-10': { name: '班', type: 'workday' },
};

/* ---------- 状态 ---------- */
const state = { students: [], courses: [], attendance: [], scores: [], plans: [], careStudents: [], careAttendance: [], holidays: [] };
let courseFilter = 'future';
let careFilter = 'all';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

async function loadAll() {
  const [s, c, a, sc, p, cs, ca, h] = await Promise.all([
    api('students?select=*&order=name.asc'),
    api('courses?select=*&order=course_date.asc,start_time.asc'),
    api('attendance?select=*&order=signed_at.desc'),
    api('scores?select=*&order=exam_date.asc,created_at.asc'),
    api('plans?select=*&order=created_at.asc'),
    api('care_students?select=*&order=name.asc'),
    api('care_attendance?select=*&order=signed_at.desc'),
    api('holidays?select=*&order=date.asc'),
  ]);
  state.students = s || [];
  state.courses = c || [];
  state.attendance = a || [];
  state.scores = sc || [];
  state.plans = p || [];
  state.careStudents = cs || [];
  state.careAttendance = ca || [];
  state.holidays = h || [];
}
function studentById(id) { return state.students.find(x => x.id === id); }
function careById(id) { return state.careStudents.find(x => x.id === id); }
function attendanceOf(courseId) { return state.attendance.find(x => x.course_id === courseId); }

/* ---------- 登录 ---------- */
async function initAuth() {
  try {
    const rows = await api('settings?key=eq.password&select=value');
    if (!rows.length) { $('#login-set').style.display = 'block'; $('#login-enter').style.display = 'none'; }
    else if (localStorage.getItem('jw_login') === '1') enterApp();
    else { $('#login-set').style.display = 'none'; $('#login-enter').style.display = 'block'; }
  } catch (e) {
    alert('连接云端数据库失败：' + e.message + '\n\n请确认：\n1. 网络能正常上网\n2. 已按步骤在 Supabase 里运行建表 SQL（含升级 SQL）');
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
  else if (name === 'care') renderCare();
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
  const low = state.students.filter(s => (s.purchased_remaining || 0) <= 2);

  $('#home-stats').innerHTML =
    '<div class="stat-card"><div class="stat-num">' + state.students.length + '</div><div class="stat-label">👦 在管学生</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + todayCourses.length + '</div><div class="stat-label">📅 今日课程</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + unchecked.length + '</div><div class="stat-label">✅ 待签到</div></div>' +
    '<div class="stat-card"><div class="stat-num">' + pending.length + (overdue.length ? '<span style="font-size:13px;color:#d64545">(' + overdue.length + '到期)</span>' : '') + '</div><div class="stat-label">📝 待办事项</div></div>';

  // 日历
  renderCalendar();

  if (!todayCourses.length) {
    $('#home-today-courses').innerHTML = '<div class="empty">今天没有排课 🎉</div>';
  } else {
    $('#home-today-courses').innerHTML = todayCourses.map(c => {
      const stu = studentById(c.student_id);
      const att = attendanceOf(c.id);
      const badge = att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '<span class="badge badge-gray">未签到</span>';
      return '<div class="course-row">' +
        '<div class="course-time">' + fmtTime(c.start_time) + '</div>' +
        '<div class="course-info"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') + (c.lesson_type === 'bonus' ? ' <span class="badge badge-orange">赠</span>' : '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + '</div></div>' + badge + '</div>';
    }).join('');
  }

  if (!low.length) {
    $('#home-low-lessons').innerHTML = '<div class="empty">暂无课时不足的学生</div>';
  } else {
    $('#home-low-lessons').innerHTML = low.map(s =>
      '<div class="list-item"><div class="list-main"><div class="list-title">' + esc(s.name) + ' · ' + esc(s.subjects || '') + '</div>' +
      '<div class="list-sub">' + esc(s.parent_phone || '') + '</div></div>' +
      '<span class="badge ' + ((s.purchased_remaining || 0) <= 0 ? 'badge-red' : 'badge-orange') + '">购剩 ' + (s.purchased_remaining || 0) + ' 节</span></div>'
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

/* ================= 日历 ================= */
function renderCalendar() {
  const year = calYear, month = calMonth;
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  let html = '<div class="cal-head"><button class="btn btn-gray btn-sm" onclick="calShift(-1)">‹ 上月</button><b>' + year + '年' + (month + 1) + '月</b><button class="btn btn-gray btn-sm" onclick="calShift(1)">下月 ›</button></div>';
  html += '<div class="cal-grid">' + ['日', '一', '二', '三', '四', '五', '六'].map(d => '<div class="cal-dow">' + d + '</div>').join('');
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell" style="background:none"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const marks = holidayMarks(ds);
    const isToday = ds === today;
    const hasRest = marks.some(m => m.type === 'rest');
    html += '<div class="cal-cell' + (isToday ? ' today' : '') + (hasRest ? ' rest-bg' : '') + '"><div class="d">' + d + '</div>' +
      marks.map(m => {
        const cls = m.type === 'workday' ? 'work' : m.type === 'rest' ? 'rest' : m.type === 'event' ? 'event' : 'hol';
        return '<div class="' + cls + '">' + esc(m.name) + '</div>';
      }).join('') + '</div>';
  }
  html += '</div>';
  $('#home-calendar').innerHTML = html;

  // 本月自定义记录（官方节假日自动标注，不在此列出）
  const prefix = year + '-' + String(month + 1).padStart(2, '0');
  const monthHols = state.holidays.filter(h => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  const typeNames = { festival: ['节日', 'badge-red'], workday: ['调休补班', 'badge-orange'], rest: ['休息日', 'badge-purple'], event: ['事项', 'badge-blue'] };
  $('#home-holidays').innerHTML = !monthHols.length
    ? '<div class="muted">本月暂无自定义记录（官方节假日已自动标注）</div>'
    : monthHols.map(h => {
      const tn = typeNames[h.type] || ['记录', 'badge-gray'];
      return '<div class="list-item" style="padding:6px 0"><div class="list-main"><span class="badge ' + tn[1] + '">' + tn[0] + '</span> ' + esc(h.name) + ' <span class="muted">' + h.date.slice(5) + '</span></div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteHoliday(' + h.id + ')">删</button></div>';
    }).join('');
}
function holidayMarks(date) {
  const marks = [];
  const off = OFFICIAL_HOLIDAYS[date];
  if (off) marks.push({ name: off.name, type: off.type, official: true });
  state.holidays.filter(h => h.date === date).forEach(h => {
    const dup = marks.find(m => m.name === h.name && m.type === h.type);
    if (!dup) marks.push({ name: h.name, type: h.type, official: false });
  });
  return marks;
}
function calShift(n) {
  calMonth += n;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function openHolidayForm() {
  openModal('添加日历记录', `
    <div class="form-grid">
      <div class="form-row"><label>日期 *</label><input id="h-date" type="date" value="${todayStr()}"></div>
      <div class="form-row"><label>类型</label>
        <select id="h-type">
          <option value="festival">节日</option>
          <option value="workday">调休补班（周末上班）</option>
          <option value="rest">我的休息日（粉色）</option>
          <option value="event">自定义事项（如：8人晚托）</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label>名称 *</label><input id="h-name" type="text" placeholder="如：休息 / 8人晚托 / 家长会"></div>
    <button class="btn btn-primary btn-block" onclick="saveHoliday()">保存</button>
  `);
}
async function saveHoliday() {
  const date = $('#h-date').value, name = $('#h-name').value.trim();
  if (!date) return alert('请选择日期');
  if (!name) return alert('请填写名称');
  try {
    await api('holidays', { method: 'POST', body: { date, name, type: $('#h-type').value } });
    await loadAll();
    closeModal();
    renderCalendar();
  } catch (e) {
    if (String(e.message).includes('duplicate')) alert('这个日期已经有记录了，先删除原记录再添加');
    else alert('保存失败：' + e.message);
  }
}
async function deleteHoliday(id) {
  if (!confirm('确定删除这条节日/调休记录吗？')) return;
  try {
    await api('holidays?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    renderCalendar();
  } catch (e) { alert('删除失败：' + e.message); }
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
  $('#stu-list').innerHTML = list.map(s => {
    const pr = s.purchased_remaining || 0;
    return '<div class="card" style="cursor:pointer" onclick="openStudentDetail(' + s.id + ')">' +
      '<div class="list-item"><div class="list-main"><div class="list-title">' + esc(s.name) +
      ' <span class="badge badge-blue">' + esc(s.grade || '') + '</span>' +
      (s.care_type && s.care_type !== 'none' ? ' <span class="badge ' + CARE_TYPE_BADGE[s.care_type] + '">🌙' + CARE_TYPE_NAMES[s.care_type] + '</span>' : '') + '</div>' +
      '<div class="list-sub">' + esc(s.subjects || '未填科目') + ' · ' + esc(s.teacher || '') + '</div></div>' +
      '<span class="badge ' + (pr <= 2 ? 'badge-red' : 'badge-green') + '">购 ' + pr + ' / 赠 ' + (s.bonus_remaining || 0) + '</span></div></div>';
  }).join('');
}

function openStudentForm(id) {
  const s = id ? studentById(id) : null;
  const f = id ? s : { name: '', grade: '', subjects: '', teacher: '', school: '', birthday: '', parent_phone: '', enroll_date: todayStr(), purchased_lessons: 0, bonus_lessons: 0, care_type: 'none', notes: '' };
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
    <div class="form-grid">
      <div class="form-row"><label>购买课时数</label><input id="f-purchased" type="number" min="0" value="${f.purchased_lessons || 0}"></div>
      <div class="form-row"><label>赠送课时数</label><input id="f-bonus" type="number" min="0" value="${f.bonus_lessons || 0}"></div>
    </div>
    <div class="form-row"><label>晚托班</label>
      <select id="f-care">
        <option value="none" ${f.care_type === 'none' || !f.care_type ? 'selected' : ''}>无（不晚托）</option>
        <option value="da" ${f.care_type === 'da' ? 'selected' : ''}>大班晚托</option>
        <option value="two" ${f.care_type === 'two' ? 'selected' : ''}>两人晚托</option>
        <option value="eight" ${f.care_type === 'eight' ? 'selected' : ''}>八人晚托</option>
      </select>
    </div>
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
    purchased_lessons: Number($('#f-purchased').value) || 0,
    bonus_lessons: Number($('#f-bonus').value) || 0,
    care_type: $('#f-care').value,
    notes: $('#f-notes').value.trim(),
  };
  if (!data.name) return alert('请填写学生姓名');
  try {
    if (id) {
      await api('students?id=eq.' + id, { method: 'PATCH', body: data });
    } else {
      data.purchased_remaining = data.purchased_lessons;
      data.bonus_remaining = data.bonus_lessons;
      await api('students', { method: 'POST', body: data });
    }
    await loadAll();
    const saved = id ? studentById(id) : state.students.find(s => s.name === data.name && s.parent_phone === data.parent_phone);
    if (saved) await syncCareFromStudent(saved);
    closeModal();
    renderStudents();
  } catch (e) { alert('保存失败：' + e.message); }
}
async function syncCareFromStudent(s) {
  try {
    if (s.care_type === 'none' || !s.care_type) {
      const matches = state.careStudents.filter(c => c.name === s.name && c.parent_phone === s.parent_phone);
      for (const m of matches) await api('care_students?id=eq.' + m.id, { method: 'DELETE' });
    } else {
      const exists = state.careStudents.find(c => c.name === s.name && c.parent_phone === s.parent_phone);
      const body = { care_type: s.care_type, grade: s.grade || '', school: s.school || '', parent_phone: s.parent_phone || '' };
      if (exists) await api('care_students?id=eq.' + exists.id, { method: 'PATCH', body });
      else await api('care_students', { method: 'POST', body: { name: s.name, ...body } });
    }
    await loadAll();
  } catch (e) {}
}

function openStudentDetail(id) {
  const s = studentById(id);
  if (!s) return;
  const myAtt = state.attendance.filter(a => a.student_id === id);
  const usedP = myAtt.filter(a => { const c = state.courses.find(x => x.id === a.course_id); return c && c.lesson_type !== 'bonus' && ['normal', 'late', 'absent'].includes(a.status); }).length;
  const usedB = myAtt.filter(a => { const c = state.courses.find(x => x.id === a.course_id); return c && c.lesson_type === 'bonus' && ['normal', 'late', 'absent'].includes(a.status); }).length;
  const myCourses = state.courses.filter(c => c.student_id === id).sort((a, b) => (b.course_date + (b.start_time || '')).localeCompare(a.course_date + (a.start_time || '')));

  let historyHtml = '';
  if (!myCourses.length) historyHtml = '<div class="empty">暂无上课记录</div>';
  else historyHtml = myCourses.slice(0, 20).map(c => {
    const att = attendanceOf(c.id);
    return '<div class="att-row"><div style="min-width:84px;font-weight:600">' + fmtDate(c.course_date) + '</div>' +
      '<div class="muted" style="min-width:44px">' + fmtTime(c.start_time) + '</div>' +
      '<div style="flex:1">' + esc(c.subject || '') + ' · ' + esc(c.teacher || '') + (c.lesson_type === 'bonus' ? ' 🎁赠' : '') + '</div>' +
      (att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '<span class="badge badge-gray">未签到</span>') + '</div>';
  }).join('');

  // 成绩：选科目 → 单科趋势图 + 该科每次考试明细
  const myScores = state.scores.filter(x => x.student_id === id);
  const subjects = [...new Set(myScores.map(x => x.subject).filter(Boolean))].sort();
  let scoresHtml = '';
  if (!myScores.length) {
    scoresHtml = '<div class="empty">还没有考试成绩，点击下方"添加成绩"</div>';
  } else {
    const firstSub = subjects[0];
    scoresHtml = '<div class="tab-bar" style="margin-bottom:6px">' +
      subjects.map(sub => '<button class="tab' + (sub === firstSub ? ' active' : '') + '" onclick="switchScoreSubject(' + id + ', \'' + esc(sub) + '\')">' + esc(sub) + '</button>').join('') +
      '</div>' +
      '<div class="chart-box"><canvas id="score-canvas-' + id + '"></canvas></div>' +
      '<div class="score-table" id="score-table-' + id + '"><div class="empty" style="padding:16px 10px;color:#888">正在加载…</div></div>' +
      '<div class="muted" style="margin-top:6px">👆 点上方科目切换；折线下方是每次考试的分数明细</div>';
  }

  openModal(esc(s.name) + ' 的档案', `
    <div class="card" style="box-shadow:none;padding:0">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">${esc(s.name)} <span class="badge badge-blue">${esc(s.grade || '')}</span>
          ${s.care_type && s.care_type !== 'none' ? '<span class="badge ' + CARE_TYPE_BADGE[s.care_type] + '">🌙' + CARE_TYPE_NAMES[s.care_type] + '</span>' : ''}</div>
          <div class="list-sub">科目：${esc(s.subjects || '')} ｜ 老师：${esc(s.teacher || '')}</div>
          <div class="list-sub">学校：${esc(s.school || '')} ｜ 生日：${esc(s.birthday || '')}</div>
          <div class="list-sub">家长电话：${esc(s.parent_phone || '')} ｜ 报名：${esc(s.enroll_date || '')}</div>
          <div class="list-sub">课时：购买 ${esc(s.purchased_lessons || 0)} 节（已用 ${usedP}，剩 <b style="color:${(s.purchased_remaining || 0) <= 2 ? '#d64545' : '#1d9d5a'}">${s.purchased_remaining || 0}</b>）｜ 赠送 ${esc(s.bonus_lessons || 0)} 节（已用 ${usedB}，剩 ${s.bonus_remaining || 0}）</div>
          ${s.notes ? '<div class="list-sub">备注：' + esc(s.notes) + '</div>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-gray btn-sm" onclick="openStudentForm(${id})">✏️ 编辑</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStudent(${id})">🗑 删除</button>
      </div>
    </div>
    <div class="section-title">📊 成绩趋势</div>
    ${scoresHtml}
    <button class="btn btn-primary btn-block" style="margin-top:8px" onclick="openScoreForm(${id})">＋ 添加考试成绩</button>
    <div class="section-title">🗓 上课记录</div>
    ${historyHtml}
  `);
  setTimeout(() => {
    if (subjects.length) switchScoreSubject(id, subjects[0]);
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
  const s = studentById(id);
  if (!confirm('确定删除该学生吗？他的排课、签到、成绩记录会一并删除，无法恢复！')) return;
  try {
    const matches = state.careStudents.filter(c => s && c.name === s.name && c.parent_phone === s.parent_phone);
    await api('students?id=eq.' + id, { method: 'DELETE' });
    for (const m of matches) await api('care_students?id=eq.' + m.id, { method: 'DELETE' });
    await loadAll();
    closeModal();
    renderStudents();
  } catch (e) { alert('删除失败：' + e.message); }
}

/* ---------- 单科成绩折线图（选科目 → 画该科全部考试） ---------- */
function switchScoreSubject(studentId, subject) {
  const tabBtns = document.querySelectorAll('#modal-body .tab-bar .tab');
  tabBtns.forEach(b => b.classList.toggle('active', b.textContent === subject));
  const myScores = state.scores.filter(x => x.student_id === studentId && x.subject === subject);
  const canvas = document.getElementById('score-canvas-' + studentId);
  if (canvas) drawScoreLine(canvas, myScores);
  const tableEl = document.getElementById('score-table-' + studentId);
  if (tableEl) {
    if (!myScores.length) {
      tableEl.innerHTML = '<div class="empty" style="padding:16px 10px;color:#888">该科目暂无成绩</div>';
    } else {
      const ordered = myScores.slice().sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || ''));
      tableEl.innerHTML = '<table><tr><th>日期</th><th>考试</th><th>分数</th><th>变化</th></tr>' +
        ordered.map((x, i) => {
          let delta = '<span class="muted">—</span>';
          if (i > 0) {
            const prev = Number(ordered[i - 1].score), cur = Number(x.score);
            const d = cur - prev;
            delta = d > 0 ? '<span style="color:#1d9d5a">▲ +' + d + '</span>' : d < 0 ? '<span style="color:#d64545">▼ ' + d + '</span>' : '<span class="muted">持平</span>';
          }
          return '<tr><td>' + (x.exam_date ? x.exam_date.slice(5) : '') + '</td><td>' + esc(x.exam_name || '') + '</td><td><b>' + x.score + '</b></td><td>' + delta + '</td></tr>';
        }).join('') + '</table>';
    }
  }
}
function drawScoreLine(canvas, scores) {
  if (!scores || !scores.length) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const ordered = scores.slice().sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || ''));
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 340, H = 230;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const padL = 36, padR = 12, padT = 16, padB = 34;
  const cw = W - padL - padR, ch = H - padT - padB;
  const vals = ordered.map(x => Number(x.score));
  const minV = Math.max(0, Math.min(...vals) - 5);
  const maxV = Math.min(1000, Math.max(...vals) + 5);
  const y = v => padT + ch - ((v - minV) / (maxV - minV || 1)) * ch;
  const x = i => ordered.length === 1 ? padL + cw / 2 : padL + (cw * i) / (ordered.length - 1);

  ctx.clearRect(0, 0, W, H);
  const color = '#2b6de8';
  // 网格
  ctx.strokeStyle = '#f0f0f0'; ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = minV + ((maxV - minV) * g) / 4;
    const yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(Math.round(v), padL - 5, yy + 3);
  }
  // 折线
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ordered.forEach((s, i) => { i === 0 ? ctx.moveTo(x(i), y(Number(s.score))) : ctx.lineTo(x(i), y(Number(s.score))); });
  ctx.stroke();
  // 点位 + 分数
  ordered.forEach((s, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(Number(s.score)), 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(s.score), x(i), y(Number(s.score)) - 9);
  });
  // x 轴：日期 + 考试名
  ordered.forEach((s, i) => {
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s.exam_date ? s.exam_date.slice(5) : '', x(i), H - 14);
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif';
    ctx.fillText(s.exam_name ? s.exam_name.slice(0, 6) : '', x(i), H - 4);
  });
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
    <div class="form-row"><label>课时类型（销课扣哪个）*</label>
      <select id="c-lessontype">
        <option value="purchase">购买课时</option>
        <option value="bonus">赠送课时</option>
      </select>
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
  const lessonType = $('#c-lessontype').value;
  const repeat = $('#c-repeat').checked;
  const weeks = repeat ? Math.min(20, Math.max(1, Number($('#c-weeknum').value) || 8)) : 1;
  const rows = [];
  const seriesId = repeat ? 's' + Date.now() : null;
  const base = new Date(date + 'T00:00:00');
  for (let i = 0; i < weeks; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    rows.push({ student_id: studentId, subject, teacher, course_date: ds, start_time: start, end_time: end, series_id: seriesId, lesson_type: lessonType });
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
        '<div class="course-info"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') +
        (c.lesson_type === 'bonus' ? ' <span class="badge badge-orange">🎁赠</span>' : '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + (c.series_id ? ' 🔁循环' : '') + '</div></div>' +
        (att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + STATUS_NAMES[att.status] + '</span>' : '') +
        '<button class="btn btn-danger btn-sm" onclick="deleteCourse(' + c.id + ', ' + (c.series_id ? 'true' : 'false') + ')">删</button></div>';
    }).join('');
    return '<div class="day-group">📆 ' + fmtDate(d) + (d === today ? ' <span class="badge badge-blue">今天</span>' : '') + (d < today ? ' <span class="badge badge-gray">已过</span>' : '') + '</div>' + items;
  }).join('');
}
async function deleteCourse(id, isSeries) {
  const c = state.courses.find(x => x.id === id);
  const stu = c ? studentById(c.student_id) : null;
  let msg = '确定删除这节课吗？\n（已签到的记录也会删除，课时会退回）';
  if (isSeries) msg = '这是循环课中的一节。\n确定删除这节课吗？（只删这一节，不影响其他周）';
  if (!confirm(msg)) return;
  try {
    await api('courses?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    renderCourses();
    if (stu) await recalcLesson(stu.id);
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
        '<div class="course-info" style="flex-basis:calc(100% - 110px)"><div class="list-title">' + (stu ? esc(stu.name) : '?') + ' · ' + esc(c.subject || '') +
        (c.lesson_type === 'bonus' ? ' <span class="badge badge-orange">🎁赠</span>' : '') + '</div>' +
        '<div class="list-sub">' + esc(c.teacher || '') + '</div></div>' +
        '<div class="sign-btns" style="width:100%;margin-top:4px;padding-left:0">' + btn('normal', '✅ 正常') + btn('late', '⏰ 迟到') + btn('leave', '💤 请假') + btn('absent', '🚫 缺勤') + '</div></div>';
    }).join('');
  }

  const recs = state.attendance.filter(a => a.course_date === date).sort((a, b) => (a.signed_at || '').localeCompare(b.signed_at || ''));
  $('#att-records').innerHTML = !recs.length
    ? '<div class="card"><div class="empty">当天还没有签到记录</div></div>'
    : '<div class="card">' + recs.map(a => {
      const stu = studentById(a.student_id);
      const c = state.courses.find(x => x.id === a.course_id);
      return '<div class="att-row"><div style="flex:1">' + (stu ? esc(stu.name) : '?') + (c && c.lesson_type === 'bonus' ? ' 🎁' : '') + '</div>' +
        '<span class="badge ' + STATUS_BADGE[a.status] + '">' + STATUS_NAMES[a.status] + '</span>' +
        '<span class="muted">' + (a.signed_at ? a.signed_at.slice(11, 16) : '') + '</span></div>';
    }).join('') + '</div>';

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
  let usedP = 0, usedB = 0;
  atts.forEach(a => {
    if (!['normal', 'late', 'absent'].includes(a.status)) return;
    const c = state.courses.find(x => x.id === a.course_id);
    if (c && c.lesson_type === 'bonus') usedB++; else usedP++;
  });
  const pr = Math.max(0, (stu.purchased_lessons || 0) - usedP);
  const br = Math.max(0, (stu.bonus_lessons || 0) - usedB);
  try {
    await api('students?id=eq.' + studentId, { method: 'PATCH', body: { purchased_remaining: pr, bonus_remaining: br } });
    stu.purchased_remaining = pr;
    stu.bonus_remaining = br;
  } catch (e) {}
}

/* ================= 晚托管理 ================= */
function setCareFilter(f) {
  careFilter = f;
  ['all', 'da', 'two', 'eight'].forEach(x => $('#care-tab-' + x).classList.toggle('active', x === f));
  renderCare();
}
function renderCare() {
  const dateInput = $('#care-date');
  if (!dateInput.value) dateInput.value = todayStr();
  const date = dateInput.value;
  const dow = new Date(date + 'T00:00:00').getDay();
  const isWeekend = dow === 0 || dow === 6;

  // 签到区
  if (isWeekend) {
    $('#care-sign-list').innerHTML = '<div class="empty">今天是周末，晚托休息 🏖</div>';
  } else {
    const list = state.careStudents.slice();
    if (careFilter !== 'all') {
      $('#care-sign-list').innerHTML = list.filter(c => c.care_type === careFilter).length
        ? list.filter(c => c.care_type === careFilter).map(c => careSignRow(c, date)).join('')
        : '<div class="empty">该类型暂无晚托学生</div>';
    } else {
      $('#care-sign-list').innerHTML = list.length ? list.map(c => careSignRow(c, date)).join('') : '<div class="empty">晚托名单还是空的，点下方"＋ 添加晚托学生"</div>';
    }
  }

  // 名单区（分组显示）
  const groups = careFilter === 'all'
    ? [['da', '大班晚托'], ['two', '两人晚托'], ['eight', '八人晚托']]
    : [[careFilter, CARE_TYPE_NAMES[careFilter]]];
  let html = '';
  groups.forEach(([type, title]) => {
    const members = state.careStudents.filter(c => c.care_type === type);
    html += '<div class="group-title">🌙 ' + title + '（' + members.length + ' 人）</div>';
    html += !members.length ? '<div class="card"><div class="empty">暂无学生</div></div>' :
      members.map(c => {
        const att = state.careAttendance.find(a => a.student_id === c.id && a.care_date === date);
        return '<div class="care-card"><div class="care-info" style="cursor:pointer" onclick="openCareDetail(' + c.id + ')">' +
          '<div class="list-title">' + esc(c.name) + ' <span class="badge badge-blue">' + esc(c.grade || '') + '</span></div>' +
          '<div class="list-sub">' + esc(c.school || '') + (c.parent_phone ? ' ｜ ' + esc(c.parent_phone) : '') + '</div></div>' +
          (att ? '<span class="badge ' + STATUS_BADGE[att.status] + '">' + CARE_STATUS_NAMES[att.status] + '</span>' : '') +
          '<button class="btn btn-danger btn-sm" onclick="deleteCare(' + c.id + ')">删</button></div>';
      }).join('');
  });
  $('#care-list').innerHTML = html;
}
function careSignRow(c, date) {
  const att = state.careAttendance.find(a => a.student_id === c.id && a.care_date === date);
  const btn = (s, name) => '<button class="sign-btn' + (att && att.status === s ? ' active' : '') + '" data-s="' + s + '" onclick="signCare(' + c.id + ', \'' + s + '\')">' + name + '</button>';
  return '<div class="course-row" style="align-items:flex-start;flex-wrap:wrap">' +
    '<div class="course-info" style="flex:1"><div class="list-title">' + esc(c.name) + ' <span class="badge ' + CARE_TYPE_BADGE[c.care_type] + '">' + CARE_TYPE_NAMES[c.care_type] + '</span></div>' +
    '<div class="list-sub">' + esc(c.school || '') + '</div></div>' +
    '<div class="sign-btns" style="width:100%;margin-top:4px">' + btn('normal', '✅ 已到') + btn('leave', '💤 请假') + btn('absent', '🚫 未到') + '</div>' +
    (att && att.signed_at ? '<div class="muted" style="width:100%">🕐 签到时间：' + att.signed_at.slice(11, 16) + '</div>' : '') + '</div>';
}
async function signCare(studentId, status) {
  const date = $('#care-date').value || todayStr();
  const existing = state.careAttendance.find(a => a.student_id === studentId && a.care_date === date);
  try {
    if (existing) {
      await api('care_attendance?id=eq.' + existing.id, { method: 'PATCH', body: { status, signed_at: new Date().toISOString() } });
    } else {
      await api('care_attendance', { method: 'POST', body: { student_id: studentId, care_date: date, status } });
    }
    await loadAll();
    renderCare();
  } catch (e) { alert('签到失败：' + e.message); }
}
async function toggleCareTask(studentId, date, field) {
  let rec = state.careAttendance.find(a => a.student_id === studentId && a.care_date === date);
  try {
    if (!rec) {
      await api('care_attendance', { method: 'POST', body: { student_id: studentId, care_date: date, status: 'normal', [field]: true } });
    } else {
      await api('care_attendance?id=eq.' + rec.id, { method: 'PATCH', body: { [field]: !rec[field] } });
    }
    await loadAll();
    openCareDetail(studentId);
  } catch (e) { alert('操作失败：' + e.message); }
}
function openCareForm(id) {
  const c = id ? careById(id) : null;
  const f = id ? c : { name: '', grade: '', school: '', parent_phone: '', care_type: 'da', notes: '' };
  openModal(id ? '编辑晚托学生' : '添加晚托学生', `
    <div class="form-row"><label>姓名 *</label><input id="cf-name" type="text" value="${esc(f.name)}"></div>
    <div class="form-grid">
      <div class="form-row"><label>年级</label><input id="cf-grade" type="text" value="${esc(f.grade)}"></div>
      <div class="form-row"><label>学校</label><input id="cf-school" type="text" value="${esc(f.school)}"></div>
    </div>
    <div class="form-row"><label>家长电话</label><input id="cf-phone" type="tel" value="${esc(f.parent_phone)}"></div>
    <div class="form-row"><label>晚托类型 *</label>
      <select id="cf-type">
        <option value="da" ${f.care_type === 'da' || !f.care_type ? 'selected' : ''}>大班晚托</option>
        <option value="two" ${f.care_type === 'two' ? 'selected' : ''}>两人晚托</option>
        <option value="eight" ${f.care_type === 'eight' ? 'selected' : ''}>八人晚托</option>
      </select>
    </div>
    <div class="form-row"><label>备注</label><textarea id="cf-notes" rows="2">${esc(f.notes)}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveCare(${id || 'null'})">保存</button>
  `);
}
async function saveCare(id) {
  const data = {
    name: $('#cf-name').value.trim(),
    grade: $('#cf-grade').value.trim(),
    school: $('#cf-school').value.trim(),
    parent_phone: $('#cf-phone').value.trim(),
    care_type: $('#cf-type').value,
    notes: $('#cf-notes').value.trim(),
  };
  if (!data.name) return alert('请填写姓名');
  try {
    if (id) await api('care_students?id=eq.' + id, { method: 'PATCH', body: data });
    else await api('care_students', { method: 'POST', body: data });
    await loadAll();
    closeModal();
    renderCare();
  } catch (e) { alert('保存失败：' + e.message); }
}
async function deleteCare(id) {
  if (!confirm('确定把该学生从晚托名单删除吗？（其晚托签到记录也会删除）')) return;
  try {
    await api('care_students?id=eq.' + id, { method: 'DELETE' });
    await loadAll();
    renderCare();
  } catch (e) { alert('删除失败：' + e.message); }
}
function openCareDetail(id) {
  const c = careById(id);
  if (!c) return;
  const today = todayStr();
  const todayRec = state.careAttendance.find(a => a.student_id === id && a.care_date === today);
  const taskBtn = (field, label) => {
    const done = !!(todayRec && todayRec[field]);
    return '<button class="task-btn' + (done ? ' done' : '') + '" onclick="toggleCareTask(' + id + ', \'' + today + '\', \'' + field + '\')">' + label + (done ? ' ✓' : '') + '</button>';
  };
  const recs = state.careAttendance.filter(a => a.student_id === id).sort((a, b) => (b.care_date || '').localeCompare(a.care_date || ''));
  const tasksOf = a => {
    const t = [];
    if (a.homework_done) t.push('作业');
    if (a.recite_done) t.push('背诵');
    if (a.correction_done) t.push('错题');
    return t.length ? t.join('·') : '';
  };
  const monthRecs = recs.slice(0, 30).map(a =>
    '<div class="att-row"><div style="min-width:84px;font-weight:600">' + fmtDate(a.care_date) + '</div>' +
    '<div style="flex:1">' + weekdayOf(a.care_date) + (a.signed_at ? '<span class="muted"> ' + a.signed_at.slice(11, 16) + '</span>' : '') + '</div>' +
    (tasksOf(a) ? '<span class="badge badge-green">' + tasksOf(a) + '</span>' : '') +
    '<span class="badge ' + STATUS_BADGE[a.status] + '">' + CARE_STATUS_NAMES[a.status] + '</span></div>'
  ).join('');
  openModal(esc(c.name) + ' 的晚托档案', `
    <div class="card" style="box-shadow:none;padding:0">
      <div class="list-item"><div class="list-main">
        <div class="list-title">${esc(c.name)} <span class="badge ${CARE_TYPE_BADGE[c.care_type]}">${CARE_TYPE_NAMES[c.care_type]}</span> <span class="badge badge-blue">${esc(c.grade || '')}</span></div>
        <div class="list-sub">学校：${esc(c.school || '')}</div>
        <div class="list-sub">家长电话：${esc(c.parent_phone || '')}</div>
        ${c.notes ? '<div class="list-sub">备注：' + esc(c.notes) + '</div>' : ''}
      </div></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-gray btn-sm" onclick="openCareForm(${id})">✏️ 编辑</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCare(${id})">🗑 删除</button>
      </div>
    </div>
    <div class="section-title">📝 今日学习情况（${fmtDate(today)}）</div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap">${taskBtn('homework_done', '📖 作业完成')}${taskBtn('recite_done', '🔊 背诵完成')}${taskBtn('correction_done', '✏️ 错题订正')}</div>
    <div class="muted" style="margin-top:8px">点一下打勾 ✓，再点一下取消</div></div>
    <div class="section-title">🗓 最近晚托签到</div>
    ${recs.length ? '<div class="card">' + monthRecs + '</div>' : '<div class="card"><div class="empty">暂无签到记录</div></div>'}
  `);
}
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function weekdayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : WEEK_CN[d.getDay()];
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

/* ================= 导出功能 ================= */
function downloadCSV(filename, rows) {
  const csv = '\ufeff' + rows.map(r => r.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}
function exportCoursesCSV() {
  const today = todayStr();
  let list = state.courses.slice();
  if (courseFilter === 'future') list = list.filter(c => c.course_date >= today);
  list.sort((a, b) => (a.course_date + (a.start_time || '')).localeCompare(b.course_date + (b.start_time || '')));
  if (!list.length) return alert('当前没有可导出的课程');
  const rows = [['日期', '星期', '开始时间', '结束时间', '学生', '科目', '老师', '课时类型', '签到状态']];
  list.forEach(c => {
    const stu = studentById(c.student_id);
    const att = attendanceOf(c.id);
    rows.push([c.course_date, weekdayOf(c.course_date), fmtTime(c.start_time), fmtTime(c.end_time), stu ? stu.name : '', c.subject || '', c.teacher || '', c.lesson_type === 'bonus' ? '赠送' : '购买', att ? STATUS_NAMES[att.status] : '未签到']);
  });
  downloadCSV('课表_' + today + '.csv', rows);
  alert('已导出 ' + list.length + ' 条课程，表格文件已下载（可用 Excel / WPS 打开）');
}
function exportAttendanceCSV() {
  const date = $('#att-date').value || todayStr();
  const recs = state.attendance.filter(a => a.course_date === date).sort((a, b) => (a.signed_at || '').localeCompare(b.signed_at || ''));
  if (!recs.length) return alert('这一天没有签到记录');
  const rows = [['日期', '学生', '科目', '课时类型', '签到状态', '签到时间']];
  recs.forEach(a => {
    const stu = studentById(a.student_id);
    const c = state.courses.find(x => x.id === a.course_id);
    rows.push([a.course_date, stu ? stu.name : '', c ? c.subject : '', c && c.lesson_type === 'bonus' ? '赠送' : '购买', STATUS_NAMES[a.status], a.signed_at ? a.signed_at.slice(0, 16).replace('T', ' ') : '']);
  });
  downloadCSV('签到记录_' + date + '.csv', rows);
  alert('已导出 ' + recs.length + ' 条签到记录，表格文件已下载（可用 Excel / WPS 打开）');
}

/* ---------- 启动 ---------- */
initAuth();
