// app.js (обновлённая версия)
console.log('app.js загружен');

let supabaseClient = null;
if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let tg = window.Telegram?.WebApp;
if (tg) tg.ready();

// Безопасное получение user_id (пока упрощённо, потом через Edge Function)
let userId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : 'demo_' + Date.now();
let userName = tg?.initDataUnsafe?.user?.first_name || 'Екатерина';

// Глобальные переменные
let targetDate = new Date(2025, 7, 15, 0, 0, 0);
let timerInterval = null;
let budgetChart = null;

// --- Вспомогательные функции (прогресс, таймер и т.д.) ---
function setProgress(percent) { /* ... как в вашем коде ... */ }
function updateProgressFromTasks() { /* ... */ }
function updateCategoryProgress() { /* ... */ }
function updateCompactTimer() { /* ... */ }
function startTimer() { /* ... */ }
async function updateWeddingDate(newDate) { /* ... */ }

// --- Загрузка данных пользователя (расширенная) ---
async function loadUserData() {
    if (!supabaseClient) return;
    // Загрузка бюджета
    let { data: budgetData } = await supabaseClient.from('budget').select('*').eq('user_id', userId).single();
    if (budgetData) {
        document.getElementById('totalBudget').value = budgetData.total_budget;
        renderBudgetCategories(budgetData.categories);
        updateBudgetChart(budgetData.categories);
    } else {
        // создать запись по умолчанию
        await supabaseClient.from('budget').insert([{ user_id: userId, total_budget: 500000 }]);
    }
    // Загрузка гостей
    let { data: guests } = await supabaseClient.from('guests').select('*').eq('user_id', userId);
    renderGuests(guests);
    // Загрузка задач с дедлайнами
    let { data: tasks } = await supabaseClient.from('user_tasks').select('*').eq('user_id', userId);
    updateRedDot(tasks);
}

// --- Бюджет ---
function renderBudgetCategories(categories) {
    const container = document.getElementById('budgetCategories');
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
    const ctx = document.getElementById('budgetChart').getContext('2d');
    if (budgetChart) budgetChart.destroy();
    budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{ data: Object.values(categories), backgroundColor: ['#FFB347','#FF6B6B','#4D9DE0','#B794F4','#2BAE66','#F7B32B'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}
async function saveBudget() {
    const total = parseInt(document.getElementById('totalBudget').value);
    const categories = getCurrentBudgetCategories();
    await supabaseClient.from('budget').upsert({ user_id: userId, total_budget: total, categories });
    alert('Бюджет сохранён');
}

// --- Гости ---
function renderGuests(guests) {
    const container = document.getElementById('guestsList');
    container.innerHTML = '';
    guests.forEach(guest => {
        const card = document.createElement('div');
        card.className = 'guest-card';
        card.setAttribute('data-id', guest.id);
        card.innerHTML = `
            <div class="guest-avatar">${guest.name.charAt(0)}</div>
            <div class="guest-info">
                <div class="guest-name">${guest.name}</div>
                <div class="guest-phone">${guest.phone || ''}</div>
            </div>
            <div class="guest-status status-${guest.status}">${guest.status === 'confirmed' ? '✅' : guest.status === 'declined' ? '❌' : '⏳'}</div>
        `;
        container.appendChild(card);
        // Свайп через Hammer.js
        const hammer = new Hammer(card);
        hammer.on('swipeleft', () => changeGuestStatus(guest.id, 'confirmed'));
        hammer.on('swiperight', () => changeGuestStatus(guest.id, 'declined'));
    });
}
async function changeGuestStatus(id, newStatus) {
    await supabaseClient.from('guests').update({ status: newStatus }).eq('id', id);
    loadUserData(); // перезагрузка
}
async function addGuest(name, phone, category) {
    await supabaseClient.from('guests').insert([{ user_id: userId, name, phone, category, status: 'pending' }]);
    loadUserData();
}

// --- Red Dot (задачи на сегодня) ---
function updateRedDot(tasks) {
    const today = new Date().toISOString().slice(0,10);
    const hasTodayTask = tasks.some(t => t.deadline === today && !t.is_done);
    const redDot = document.getElementById('todayRedDot');
    if (redDot) redDot.style.display = hasTodayTask ? 'inline-block' : 'none';
}
async function showTodayTasks() {
    let { data: tasks } = await supabaseClient.from('user_tasks').select('*').eq('user_id', userId);
    const today = new Date().toISOString().slice(0,10);
    const todayTasks = tasks.filter(t => t.deadline === today && !t.is_done);
    if (todayTasks.length === 0) {
        alert('На сегодня нет задач!');
        return;
    }
    let msg = '📋 Задачи на сегодня:\n';
    todayTasks.forEach(t => msg += `- ${t.task_name}\n`);
    alert(msg);
}

// --- Обработчики чекбоксов (с учётом дедлайнов) ---
async function handleCheckboxClick(e) { /* ваш код с обновлением is_done и сохранением в user_tasks */ }
function bindAllCheckboxes() { /* ... */ }

// --- Инициализация DOM ---
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация темы, имени, кнопок и т.д.
    initTheme();
    document.getElementById('userName').innerText = userName;
    document.getElementById('userAvatar').innerText = userName.charAt(0);
    document.getElementById('editDateBtn').addEventListener('click', editWeddingDate);
    bindAllCheckboxes();
    await loadUserData();
    startTimer();

    // Переключение вкладок
    const screens = {
        dashboard: document.getElementById('dashboard'),
        checklist: document.getElementById('checklistScreen'),
        budget: document.getElementById('budgetScreen'),
        guests: document.getElementById('guestsScreen')
    };
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            Object.keys(screens).forEach(s => screens[s].classList.remove('active'));
            if (screens[tab]) screens[tab].classList.add('active');
            document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Плавающая кнопка консультации
    const floatingBtn = document.getElementById('floatingConsultBtn');
    const modal = document.getElementById('consultModal');
    floatingBtn.onclick = () => modal.classList.add('active');
    // ... закрытие модалки как в вашем коде ...

    // Бюджет
    document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
    // Гости
    document.getElementById('addGuestBtn').addEventListener('click', () => document.getElementById('guestModal').classList.add('active'));
    document.getElementById('saveGuestBtn').addEventListener('click', async () => {
        const name = document.getElementById('guestName').value;
        const phone = document.getElementById('guestPhone').value;
        const category = document.getElementById('guestCategory').value;
        if (name) await addGuest(name, phone, category);
        document.getElementById('guestModal').classList.remove('active');
    });
    document.getElementById('exportGuestsBtn').addEventListener('click', () => {
        alert('Экспорт CSV/PDF будет реализован в следующей версии');
    });

    // Сегодняшние задачи
    document.getElementById('todayTaskBtn').addEventListener('click', showTodayTasks);

    // Добавление своей задачи
    document.getElementById('addCustomTaskBtn').addEventListener('click', () => document.getElementById('taskModal').classList.add('active'));
    document.getElementById('saveTaskBtn').addEventListener('click', async () => {
        const taskName = document.getElementById('newTaskName').value;
        const deadline = document.getElementById('newTaskDeadline').value;
        if (taskName) {
            await supabaseClient.from('user_tasks').upsert({ user_id: userId, task_name: taskName, deadline, is_done: false });
            location.reload(); // или обновить список задач
        }
        document.getElementById('taskModal').classList.remove('active');
    });
    // Закрытие модалок
    document.querySelectorAll('.modal .btn-secondary, .modal .modal-close').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal').classList.remove('active'));
    });
});