// app.js – полная рабочая версия с объединением старого и нового функционала
console.log('app.js загружен');

let supabaseClient = null;
if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase клиент создан');
}

let tg = window.Telegram?.WebApp;
if (tg) tg.ready();

let userId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : 'demo_' + Date.now();
let userName = tg?.initDataUnsafe?.user?.first_name || 'Екатерина';

// Глобальные переменные
let targetDate = new Date(2025, 7, 15, 0, 0, 0);
let timerInterval = null;
let budgetChart = null;

// ========== СТАРЫЕ ФУНКЦИИ (ПРОГРЕСС, ТАЙМЕР, ТЕМЫ, ЧЕКБОКСЫ) ==========
function setProgress(percent) {
    const circle = document.querySelector('.progress-ring-circle');
    if (circle) {
        const radius = 63;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
    const percentNumber = document.getElementById('percentNumber');
    if (percentNumber) percentNumber.innerText = percent;
}

function updateProgressFromTasks() {
    const allChecks = document.querySelectorAll('.agency-check, .task-check, .task-check-cat');
    let total = allChecks.length;
    let done = 0;
    allChecks.forEach(ch => { if (ch.classList.contains('checked')) done++; });
    let percent = total === 0 ? 0 : Math.round((done / total) * 100);
    setProgress(percent);
    if (supabaseClient) {
        supabaseClient.from('users').update({ progress_percent: percent }).eq('user_id', userId).catch(console.error);
    }
}

function updateCategoryProgress() {
    const venueTasks = document.querySelectorAll('.task-check-cat[data-cat="venue"]');
    let venueDone = 0;
    venueTasks.forEach(t => { if (t.classList.contains('checked')) venueDone++; });
    const catVenue = document.getElementById('catVenueProgress');
    if (catVenue) catVenue.innerText = `${venueDone}/${venueTasks.length}`;
    
    const vendorsTasks = document.querySelectorAll('.task-check-cat[data-cat="vendors"]');
    let vendorsDone = 0;
    vendorsTasks.forEach(t => { if (t.classList.contains('checked')) vendorsDone++; });
    const catVendors = document.getElementById('catVendorsProgress');
    if (catVendors) catVendors.innerText = `${vendorsDone}/${vendorsTasks.length}`;
}

function updateCompactTimer() {
    const now = new Date();
    const diff = targetDate - now;
    const timerSpan = document.getElementById('compactTimer');
    if (!timerSpan) return;
    if (diff <= 0) {
        timerSpan.innerText = 'свадьба прошла';
        if (timerInterval) clearInterval(timerInterval);
        return;
    }
    const days = Math.floor(diff / (1000*60*60*24));
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    timerSpan.innerText = `${days} д ${hours} ч ${minutes} мин`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    updateCompactTimer();
    timerInterval = setInterval(updateCompactTimer, 60000);
}

async function updateWeddingDate(newDate) {
    if (!supabaseClient) return;
    await supabaseClient.from('users').update({ wedding_date: newDate.toISOString() }).eq('user_id', userId);
}

async function editWeddingDate() {
    let newDateStr = prompt("Введите новую дату свадьбы в формате ДД.ММ.ГГГГ", "15.08.2025");
    if (!newDateStr) return;
    let parts = newDateStr.split('.');
    if (parts.length !== 3) {
        alert("Неверный формат. Используйте ДД.ММ.ГГГГ");
        return;
    }
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    let newDate = new Date(year, month, day, 0, 0, 0);
    if (isNaN(newDate.getTime())) {
        alert("Некорректная дата");
        return;
    }
    if (newDate < new Date()) {
        alert("Дата не может быть в прошлом. Введите будущую дату.");
        return;
    }
    targetDate = newDate;
    const weddingSpan = document.getElementById('weddingDateDisplay');
    if (weddingSpan) weddingSpan.innerText = newDateStr;
    await updateWeddingDate(targetDate);
    startTimer();
}

async function handleCheckboxClick(e) {
    const cb = e.currentTarget;
    const taskName = cb.dataset.task;
    if (!taskName) return;
    const newState = !cb.classList.contains('checked');
    if (newState) cb.classList.add('checked');
    else cb.classList.remove('checked');
    
    if (supabaseClient) {
        await supabaseClient.from('user_tasks').upsert(
            { user_id: userId, task_name: taskName, is_done: newState, updated_at: new Date() },
            { onConflict: 'user_id, task_name' }
        );
    }
    
    if (cb.classList.contains('task-check-cat')) {
        const parentRow = cb.closest('.task-row');
        if (parentRow) {
            const textSpan = parentRow.querySelector('.task-text-cat');
            if (textSpan) {
                if (newState) textSpan.classList.add('done');
                else textSpan.classList.remove('done');
            }
        }
    }
    updateProgressFromTasks();
    updateCategoryProgress();
}

function bindAllCheckboxes() {
    const checkboxes = document.querySelectorAll('.agency-check, .task-check, .task-check-cat');
    checkboxes.forEach(cb => {
        cb.removeEventListener('click', handleCheckboxClick);
        cb.addEventListener('click', handleCheckboxClick);
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('wedding_theme') || 'modern';
    document.body.className = `theme-${savedTheme}`;
    document.querySelectorAll('.theme-dot').forEach(dot => {
        if (dot.dataset.theme === savedTheme) dot.style.transform = 'scale(1.1)';
        else dot.style.transform = 'scale(1)';
    });
}

// ========== НОВЫЕ ФУНКЦИИ (БЮДЖЕТ, ГОСТИ, RED DOT) ==========
async function loadUserData() {
    if (!supabaseClient) return;
    // Бюджет
    let { data: budgetData } = await supabaseClient.from('budget').select('*').eq('user_id', userId).single();
    if (budgetData) {
        document.getElementById('totalBudget').value = budgetData.total_budget;
        renderBudgetCategories(budgetData.categories);
        updateBudgetChart(budgetData.categories);
    } else {
        await supabaseClient.from('budget').insert([{ user_id: userId, total_budget: 500000 }]);
    }
    // Гости
    let { data: guests } = await supabaseClient.from('guests').select('*').eq('user_id', userId);
    renderGuests(guests || []);
    // Задачи с дедлайнами (для red dot)
    let { data: tasks } = await supabaseClient.from('user_tasks').select('*').eq('user_id', userId);
    updateRedDot(tasks || []);
}

function renderBudgetCategories(categories) {
    const container = document.getElementById('budgetCategories');
    if (!container) return;
    container.innerHTML = '';
    for (let [cat, val] of Object.entries(categories)) {
        const div = document.createElement('div');
        div.className = 'category-slider';
        div.innerHTML = `
            <label>${cat} <span id="${cat}Val">${val}</span> ₽</label>
            <input type="range" data-cat="${cat}" min="0" max="500000" value="${val}" step="1000">
        `;
        container.appendChild(div);
    }
    document.querySelectorAll('#budgetCategories input').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const cat = e.target.dataset.cat;
            const val = parseInt(e.target.value);
            document.getElementById(`${cat}Val`).innerText = val;
            let current = getCurrentBudgetCategories();
            current[cat] = val;
            updateBudgetChart(current);
        });
    });
}

function getCurrentBudgetCategories() {
    let cats = {};
    document.querySelectorAll('#budgetCategories input').forEach(inp => {
        cats[inp.dataset.cat] = parseInt(inp.value);
    });
    return cats;
}

function updateBudgetChart(categories) {
    const ctx = document.getElementById('budgetChart');
    if (!ctx) return;
    if (budgetChart) budgetChart.destroy();
    budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{ data: Object.values(categories), backgroundColor: ['#FFB347','#FF6B6B','#4D9DE0','#B794F4','#2BAE66','#F7B32B'] }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
}

async function saveBudget() {
    const total = parseInt(document.getElementById('totalBudget').value);
    const categories = getCurrentBudgetCategories();
    await supabaseClient.from('budget').upsert({ user_id: userId, total_budget: total, categories });
    alert('Бюджет сохранён');
}

function renderGuests(guests) {
    const container = document.getElementById('guestsList');
    if (!container) return;
    container.innerHTML = '';
    guests.forEach(guest => {
        const card = document.createElement('div');
        card.className = 'guest-card';
        card.setAttribute('data-id', guest.id);
        card.innerHTML = `
            <div class="guest-avatar">${guest.name.charAt(0)}</div>
            <div class="guest-info">
                <div class="guest-name">${escapeHtml(guest.name)}</div>
                <div class="guest-phone">${escapeHtml(guest.phone || '')}</div>
            </div>
            <div class="guest-status status-${guest.status}">${guest.status === 'confirmed' ? '✅' : guest.status === 'declined' ? '❌' : '⏳'}</div>
        `;
        container.appendChild(card);
        if (typeof Hammer !== 'undefined') {
            const hammer = new Hammer(card);
            hammer.on('swipeleft', () => changeGuestStatus(guest.id, 'confirmed'));
            hammer.on('swiperight', () => changeGuestStatus(guest.id, 'declined'));
        }
    });
}

function escapeHtml(str) { return str.replace(/[&<>]/g, function(m){if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m;}); }

async function changeGuestStatus(id, newStatus) {
    await supabaseClient.from('guests').update({ status: newStatus }).eq('id', id);
    loadUserData();
}

async function addGuest(name, phone, category) {
    await supabaseClient.from('guests').insert([{ user_id: userId, name, phone, category, status: 'pending' }]);
    loadUserData();
}

function updateRedDot(tasks) {
    const today = new Date().toISOString().slice(0,10);
    const hasTodayTask = tasks.some(t => t.deadline === today && !t.is_done);
    const redDot = document.getElementById('todayRedDot');
    if (redDot) redDot.style.display = hasTodayTask ? 'inline-block' : 'none';
}

async function showTodayTasks() {
    let { data: tasks } = await supabaseClient.from('user_tasks').select('*').eq('user_id', userId);
    const today = new Date().toISOString().slice(0,10);
    const todayTasks = (tasks || []).filter(t => t.deadline === today && !t.is_done);
    if (todayTasks.length === 0) {
        alert('На сегодня нет задач!');
        return;
    }
    let msg = '📋 Задачи на сегодня:\n';
    todayTasks.forEach(t => msg += `- ${t.task_name}\n`);
    alert(msg);
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM загружен, инициализация...');
    
    initTheme();
    const userNameSpan = document.getElementById('userName');
    const userAvatarSpan = document.getElementById('userAvatar');
    if (userNameSpan) userNameSpan.innerText = userName;
    if (userAvatarSpan) userAvatarSpan.innerText = userName.charAt(0);
    
    const editBtn = document.getElementById('editDateBtn');
    if (editBtn) editBtn.addEventListener('click', editWeddingDate);
    
    bindAllCheckboxes();
    await loadUserData();
    startTimer();
    
    // Переключение "Что делает агентство" / "Мои задачи"
    const toggleBtns = document.querySelectorAll('.toggle-option');
    const agencyDiv = document.getElementById('agencyBlock');
    const tasksDiv = document.getElementById('tasksBlock');
    if (toggleBtns.length && agencyDiv && tasksDiv) {
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.toggle;
                if ((target === 'agency' && !agencyDiv.classList.contains('hidden')) ||
                    (target === 'tasks' && !tasksDiv.classList.contains('hidden'))) return;
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (target === 'agency') {
                    agencyDiv.classList.remove('hidden');
                    tasksDiv.classList.add('hidden');
                } else {
                    agencyDiv.classList.add('hidden');
                    tasksDiv.classList.remove('hidden');
                }
            });
        });
    }
    
    // Раскрытие категорий в чек-листе
    document.querySelectorAll('.category').forEach(cat => {
        const header = cat.querySelector('.category-header');
        if (header) header.addEventListener('click', () => cat.classList.toggle('open'));
    });
    
    // Переключение нижних вкладок (Главная, Чек-лист, Бюджет, Гости)
    const screens = {
        dashboard: document.getElementById('dashboard'),
        checklist: document.getElementById('checklistScreen'),
        budget: document.getElementById('budgetScreen'),
        guests: document.getElementById('guestsScreen')
    };
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            Object.keys(screens).forEach(s => {
                if (screens[s]) screens[s].classList.remove('active');
            });
            if (screens[tab]) screens[tab].classList.add('active');
            document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Плавающая кнопка консультации
    const floatingBtn = document.getElementById('floatingConsultBtn');
    const consultModal = document.getElementById('consultModal');
    if (floatingBtn && consultModal) {
        floatingBtn.onclick = () => consultModal.classList.add('active');
    }
    
    // Модалка консультации (старая логика)
    const modalClose = document.getElementById('modalClose');
    const modalSubmit = document.getElementById('modalSubmit');
    if (modalClose && consultModal) modalClose.onclick = () => consultModal.classList.remove('active');
    if (consultModal) {
        consultModal.addEventListener('click', (e) => { if (e.target === consultModal) consultModal.classList.remove('active'); });
    }
    if (modalSubmit && supabaseClient) {
        modalSubmit.onclick = async () => {
            const name = document.getElementById('consultName').value.trim();
            const phone = document.getElementById('consultPhone').value.trim();
            const datetime = document.getElementById('consultDatetime').value;
            if (!name || !phone) { alert('Пожалуйста, укажите имя и телефон.'); return; }
            const { error } = await supabaseClient.from('consultations').insert([{
                user_id: userId, name, phone, preferred_date: datetime ? new Date(datetime).toISOString() : null, status: 'new'
            }]);
            if (error) { console.error(error); alert('Ошибка при отправке.'); }
            else { alert('Спасибо! Ваша заявка принята.'); consultModal.classList.remove('active'); }
        };
    }
    
    // Переключение цветовых тем
    document.querySelectorAll('.theme-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const theme = dot.dataset.theme;
            document.body.className = `theme-${theme}`;
            localStorage.setItem('wedding_theme', theme);
            document.querySelectorAll('.theme-dot').forEach(d => d.style.transform = 'scale(1)');
            dot.style.transform = 'scale(1.1)';
        });
    });
    
    // НОВЫЕ ЭЛЕМЕНТЫ (бюджет, гости, задачи)
    const saveBudgetBtn = document.getElementById('saveBudgetBtn');
    if (saveBudgetBtn) saveBudgetBtn.addEventListener('click', saveBudget);
    
    const addGuestBtn = document.getElementById('addGuestBtn');
    const guestModal = document.getElementById('guestModal');
    if (addGuestBtn && guestModal) addGuestBtn.onclick = () => guestModal.classList.add('active');
    const saveGuestBtn = document.getElementById('saveGuestBtn');
    if (saveGuestBtn && guestModal) {
        saveGuestBtn.onclick = async () => {
            const name = document.getElementById('guestName').value.trim();
            const phone = document.getElementById('guestPhone').value.trim();
            const category = document.getElementById('guestCategory').value;
            if (name) await addGuest(name, phone, category);
            guestModal.classList.remove('active');
        };
    }
    const closeGuestModal = document.getElementById('closeGuestModal');
    if (closeGuestModal && guestModal) closeGuestModal.onclick = () => guestModal.classList.remove('active');
    
    const exportBtn = document.getElementById('exportGuestsBtn');
    if (exportBtn) exportBtn.onclick = () => alert('Экспорт CSV/PDF будет добавлен позже');
    
    const todayTaskBtn = document.getElementById('todayTaskBtn');
    if (todayTaskBtn) todayTaskBtn.addEventListener('click', showTodayTasks);
    
    const addCustomTaskBtn = document.getElementById('addCustomTaskBtn');
    const taskModal = document.getElementById('taskModal');
    if (addCustomTaskBtn && taskModal) addCustomTaskBtn.onclick = () => taskModal.classList.add('active');
    const saveTaskBtn = document.getElementById('saveTaskBtn');
    if (saveTaskBtn && taskModal) {
        saveTaskBtn.onclick = async () => {
            const taskName = document.getElementById('newTaskName').value.trim();
            const deadline = document.getElementById('newTaskDeadline').value;
            if (taskName && supabaseClient) {
                await supabaseClient.from('user_tasks').upsert({ user_id: userId, task_name: taskName, deadline, is_done: false });
                location.reload();
            }
            taskModal.classList.remove('active');
        };
    }
    const closeTaskModal = document.getElementById('closeTaskModal');
    if (closeTaskModal && taskModal) closeTaskModal.onclick = () => taskModal.classList.remove('active');
    
    // Закрытие модалок по клику на фон
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    console.log('Инициализация завершена');
});