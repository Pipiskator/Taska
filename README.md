# Taska — Интеллектуальный менеджер задач

React + Vite + Tailwind CSS + React Router + Supabase (PostgREST)

## Реализованные функции (22 из 41)

| # | Функция | Готово |
|---|---------|--------|
| 1 | Пользователи | ✓ |
| 2 | Задачи | ✓ |
| 3 | Подзадачи | ✓ |
| 6 | Идентификатор | ✓ |
| 7 | Дата создания | ✓ |
| 9 | Статус | ✓ |
| 10 | Приоритет | ✓ |
| 11 | Срок выполнения | ✓ |
| 12 | Описание | ✓ |
| 14 | Повторяющаяся задача | ✓ |
| 15 | Зависимость между задачами | ✓ |
| 16 | Создание задачи | ✓ |
| 17 | Редактирование задачи | ✓ |
| 18 | Удаление задачи | ✓ |
| 20 | Изменение статуса | ✓ |
| 23 | Фильтр задач | ✓ |
| 26 | Поиск по ключевым словам | ✓ |
| 36 | Авторизация | ✓ |
| 38 | Обработка контекста (LLM) | ✓ |
| 39 | Декомпозиция задач (LLM) | ✓ |
| 40 | Генерация содержания задач (LLM) | ✓ |
| 41 | Генерация поддерживающих сообщений (LLM) | ✓ |

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Откроется на http://localhost:5173
Для входа: существующий email + пароль из таблицы `users` или создайте аккаунт на `/register`

## Запуск LLM-модуля (DeepSeek)

```bash
cd llm-module
python3 -m pip install -r requiments.txt
export LLM_API_KEY=your_deepseek_api_key
uvicorn src.main:app --reload
```

По умолчанию фронт ходит в `http://127.0.0.1:8000/llm/*` через Vite proxy.

## Переменные окружения

```bash
VITE_SUPABASE_URL=https://lwubemrxawortcoxzkcc.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_LLM_API_BASE_URL=
VITE_LLM_PROXY_TARGET=http://127.0.0.1:8000
```

## Маршруты

| Путь | Страница |
|------|----------|
| /login | Вход |
| /register | Регистрация |
| /tasks | Список задач |
| /tasks/new | Новая задача |
| /tasks/:id | Детальная карточка |
| /tasks/:id/edit | Редактирование |

## Заметки по AI

AI-кнопки используют локальный FastAPI модуль из `llm-module`:
- `POST /llm/chat` для декомпозиции и генерации описания;
- `POST /llm/encouragement` для подбадривающего сообщения.

## Структура

```
src/
├── App.jsx
├── main.jsx
├── index.css
├── store.js              # Supabase REST API (users/tasks/subtasks/dependencies)
├── pages/
│   ├── LoginPage.jsx
│   ├── TasksPage.jsx     # список + фильтры + поиск
│   ├── TaskPage.jsx      # детальная карточка + AI
│   └── TaskFormPage.jsx  # создание/редактирование
└── components/
    ├── layout/Layout.jsx
    ├── task/TaskCard.jsx
    └── ui/index.jsx
```
