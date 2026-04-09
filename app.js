// --- Инициализация Supabase (без дублирования) ---
let supabase = null;
try {
    if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase инициализирован');
    } else {
        console.warn('Supabase не доступен, работаем в локальном режиме');
    }
} catch (e) {
    console.error('Ошибка инициализации Supabase:', e);
}

// Отладочные сообщения
console.log('app.js загружен');

// --- Telegram WebApp ---
let tg = window.Telegram?.WebApp;
let userId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : 'demo_user_123';
let userName = tg?.initDataUnsafe?.user?.first_name || 'Екатерина';

// Сообщаем Telegram, что приложение готово
if (tg) tg.ready();

// --- Глобальные переменные ---
let targetDate = new Date(2025, 7, 15, 0, 0, 0);
let timerInterval;

// --- Функции прогресса ---
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
    if (supabase) {
        supabase.from('users').update({ progress_percent: percent }).eq('user_id', userId).catch(e => console.error);
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

// --- Работа с БД ---
async function updateUserTask(taskName, isDone) {
    if (!supabase) return;
    const { error } = await supabase
        .from('user_tasks')
        .upsert({ user_id: userId, task_name: taskName, is_done: isDone, updated_at: new Date() }, { onConflict: 'user_id, task_name' });
    if (error) console.error('Ошибка upsert user_tasks:', error);
}

async function updateWeddingDate(newDate) {
    if (!supabase) return;
    const { error } = await supabase
        .from('users')
        .update({ wedding_date: newDate.toISOString() })
        .eq('user_id', userId);
    if (error) console.error('Ошибка обновления даты:', error);
}

async function loadUserData() {
    if (!supabase) {
        console.warn('Supabase не доступен, загружаем локальные данные');
        startTimer();
        return;
    }
    try {
        let { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error(error);
        }
        if (!user) {
            await supabase.from('users').insert([{ user_id: userId, full_name: userName, wedding_date: targetDate.toISOString() }]);
        } else {
            if (user.wedding_date) {
                targetDate = new Date(user.wedding_date);
                const displayDate = targetDate.toLocaleDateString('ru-RU');
                const weddingSpan = document.getElementById('weddingDateDisplay');
                if (weddingSpan) weddingSpan.innerText = displayDate;
                startTimer();
            }
        }
        let { data: tasks, error: tasksErr } = await supabase
            .from('user_tasks')
            .select('task_name, is_done')
            .eq('user_id', userId);
        if (!tasksErr && tasks) {
            tasks.forEach(t => {
                let check = document.querySelector(`.agency-check[data-task="${t.task_name}"], .task-check[data-task="${t.task_name}"], .task-check-cat[data-task="${t.task_name}"]`);
                if (check) {
                    if (t.is_done) check.classList.add('checked');
                    else check.classList.remove('checked');
                }
                if (check && check.classList.contains('task-check-cat')) {
                    let parentRow = check.closest('.task-row');
                    if (parentRow) {
                        let textSpan = parentRow.querySelector('.task-text-cat');
                        if (textSpan) {
                            if (t.is_done) textSpan.classList.add('done');
                            else textSpan.classList.remove('done');
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error('Ошибка загрузки данных пользователя:', e);
    }
    updateProgressFromTasks();
    updateCategoryProgress();
}

// --- Таймер ---
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

async function editWeddingDate() {
    let newDateStr = prompt("Введите новую дату свадьбы в формате ДД.ММ.ГГГГ", "15.08.2025");
    if (!newDateStr) return;
    let parts = newDateStr.split('.');
    if (parts.length !== 3) { alert("Неверный формат. Используйте ДД.ММ.ГГГГ"); return; }
    let day = parseInt(parts[0],10), month = parseInt(parts[1],10)-1, year = parseInt(parts[2],10);
    let newDate = new Date(year, month, day, 0,0,0);
    if (isNaN(newDate.getTime())) { alert("Некорректная дата"); return; }
    if (newDate < new Date()) { alert("Дата не может быть в прошлом. Введите будущую дату."); return; }
    targetDate = newDate;
    const weddingSpan = document.getElementById('weddingDateDisplay');
    if (weddingSpan) weddingSpan.innerText = newDateStr;
    await updateWeddingDate(targetDate);
    startTimer();
}

// --- Обработчики чекбоксов ---
async function handleCheckboxClick(e) {
    const cb = e.currentTarget;
    const taskName = cb.dataset.task;
    if (!taskName) return;
    const newState = !cb.classList.contains('checked');
    if (newState) cb.classList.add('checked');
    else cb.classList.remove('checked');
    await updateUserTask(taskName, newState);
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
    console.log('Найдено чекбоксов:', checkboxes.length);
    checkboxes.forEach(cb => {
        cb.removeEventListener('click', handleCheckboxClick);
        cb.addEventListener('click', handleCheckboxClick);
    });
}

// --- Сохранение и загрузка темы ---
function initTheme() {
    const savedTheme = localStorage.getItem('wedding_theme') || 'modern';
    document.body.className = `theme-${savedTheme}`;
    document.querySelectorAll('.theme-dot').forEach(dot => {
        if (dot.dataset.theme === savedTheme) {
            dot.style.transform = 'scale(1.1)';
        } else {
            dot.style.transform = 'scale(1)';
        }
    });
}

// --- Инициализация после загрузки DOM ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM загружен, начинаем инициализацию');

    // 1. Тема
    initTheme();

    // 2. Заполнение имени и аватара
    const userNameSpan = document.getElementById('userName');
    const userAvatarSpan = document.getElementById('userAvatar');
    if (userNameSpan) userNameSpan.innerText = userName;
    if (userAvatarSpan) userAvatarSpan.innerText = userName.charAt(0);

    // 3. Кнопка изменения даты
    const editBtn = document.getElementById('editDateBtn');
    if (editBtn) editBtn.addEventListener('click', editWeddingDate);

    // 4. Чекбоксы
    bindAllCheckboxes();

    // 5. Загрузка данных из Supabase
    await loadUserData();

    // 6. Таймер
    startTimer();

    // 7. Переключение блоков "Что делает агентство" / "Мои задачи"
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

    // 8. Раскрытие категорий в чек-листе
    document.querySelectorAll('.category').forEach(cat => {
        const header = cat.querySelector('.category-header');
        if (header) header.addEventListener('click', () => cat.classList.toggle('open'));
    });

    // 9. Переключение вкладок (Главная / Чек-лист)
    const screens = {
        dashboard: document.getElementById('dashboard'),
        checklist: document.getElementById('checklistScreen')
    };
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === 'checklist') {
                if (screens.dashboard) screens.dashboard.classList.remove('active');
                if (screens.checklist) screens.checklist.classList.add('active');
            } else if (tab === 'dashboard') {
                if (screens.checklist) screens.checklist.classList.remove('active');
                if (screens.dashboard) screens.dashboard.classList.add('active');
            }
            document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 10. Модальное окно консультации
    const modal = document.getElementById('consultModal');
    const consultBtn = document.getElementById('consultBtn');
    const modalClose = document.getElementById('modalClose');
    const modalSubmit = document.getElementById('modalSubmit');
    if (consultBtn && modal) consultBtn.addEventListener('click', () => modal.classList.add('active'));
    if (modalClose && modal) modalClose.addEventListener('click', () => modal.classList.remove('active'));
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    if (modalSubmit) {
        modalSubmit.addEventListener('click', async () => {
            const name = document.getElementById('consultName').value.trim();
            const phone = document.getElementById('consultPhone').value.trim();
            const datetime = document.getElementById('consultDatetime').value;
            if (!name || !phone) {
                alert('Пожалуйста, укажите имя и телефон.');
                return;
            }
            if (!supabase) {
                alert('Сервис временно недоступен. Попробуйте позже.');
                return;
            }
            const { error } = await supabase
                .from('consultations')
                .insert([{
                    user_id: userId,
                    name: name,
                    phone: phone,
                    preferred_date: datetime ? new Date(datetime).toISOString() : null,
                    status: 'new'
                }]);
            if (error) {
                console.error(error);
                alert('Ошибка при отправке. Попробуйте позже.');
            } else {
                alert('Спасибо! Ваша заявка принята. Координатор свяжется с вами.');
                modal.classList.remove('active');
                document.getElementById('consultName').value = '';
                document.getElementById('consultPhone').value = '';
                document.getElementById('consultDatetime').value = '';
            }
        });
    }

    // 11. Переключение цветовых тем
    document.querySelectorAll('.theme-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const theme = dot.dataset.theme;
            document.body.className = `theme-${theme}`;
            localStorage.setItem('wedding_theme', theme);
            document.querySelectorAll('.theme-dot').forEach(d => d.style.transform = 'scale(1)');
            dot.style.transform = 'scale(1.1)';
        });
    });

    console.log('Инициализация завершена');
});