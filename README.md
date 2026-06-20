# Рейтинг абитуриентов колледжа

Веб-система для публикации рейтингов абитуриентов из Excel-файлов и внутреннего учёта оригиналов документов.

Проект теперь разделён на **три независимых приложения**. У каждого приложения свой `package.json`, свой `node_modules`, своя сборка и свой запуск.

```text
backend/   # API, авторизация, PostgreSQL, бизнес-логика, импорт/экспорт Excel
client/    # публичное приложение для абитуриентов
admin/     # отдельная админ-панель для сотрудников
```

В корне остаются общие файлы проекта:

```text
README.md
.gitignore
docker-compose.yml
.env
.env.example
```

---

## Возможности

### Client

- Поиск абитуриента по полному СНИЛС.
- Маскированный вывод СНИЛС: первые 3 и последние 3 цифры.
- Просмотр списков поступающих по специальностям.
- Разделение списков по форме обучения: `Очная`, `Заочная`, `Очно-заочная`.
- Отображение бюджетных и внебюджетных мест.
- Отображение отметки оригинала документа.

### Admin

- Вход сотрудника через email и пароль.
- Загрузка Excel-файла с реестром заявлений.
- Автоматическое распределение абитуриентов по специальностям и форме обучения.
- Поиск по ФИО, СНИЛС, коду или части названия специальности.
- Отметка оригинала документа.
- Отметка первоочередного зачисления.
- Редактирование количества бюджетных и внебюджетных мест.
- Выгрузка Excel-файла по каждой специальности для абитуриентов с оригиналом.

### Backend

- REST API.
- JWT access token.
- Refresh token в `httpOnly` cookie.
- Проверка роли `admin` для административных маршрутов.
- PostgreSQL.
- Импорт `.xls/.xlsx`.
- Экспорт `.xlsx`.

---

## Установка

Устанавливать зависимости нужно отдельно в каждом приложении.

```bash
cd backend
npm install
```

```bash
cd ../client
npm install
```

```bash
cd ../admin
npm install
```

---

## `.env`

Создайте `.env` в корне проекта:

```bash
cp .env.example .env
```

Пример:

```env
AUTH_SECRET=change-this-long-secret
PORT=3001
DATABASE_URL=postgresql://college_app:local-development-password@127.0.0.1:5432/college_rating
APP_ORIGIN=http://localhost:5173,http://localhost:5174
VITE_API_URL=http://localhost:3001
```

`AUTH_SECRET` лучше сгенерировать:

```bash
openssl rand -hex 32
```

---

## Первый запуск локально

### 1. Запустить PostgreSQL

Из корня проекта:

```bash
docker compose up -d postgres
```

### 2. Применить миграции

```bash
cd backend
npm run db:migrate
```

### 3. Создать администратора

```bash
npm run admin:create -- admin@example.com strong-password
```

Если пользователь уже существует, команда обновит пароль и назначит роль `admin`.

### 4. Запустить backend

```bash
cd backend
npm run dev
```

Backend будет доступен на:

```text
http://localhost:3001
```

### 5. Запустить client

В новом терминале:

```bash
cd client
npm run dev
```

Client будет доступен на:

```text
http://localhost:5173
```

### 6. Запустить admin

В новом терминале:

```bash
cd admin
npm run dev
```

Admin будет доступен на:

```text
http://localhost:5174
```

---

## Запуск на телефоне в одной Wi‑Fi сети

Если открываете с телефона, `localhost` не подойдёт. Нужно использовать IP вашего Mac.

Пример:

```env
APP_ORIGIN=http://localhost:5173,http://localhost:5174,http://192.168.1.16:5173,http://192.168.1.16:5174
VITE_API_URL=http://192.168.1.16:3001
```

После изменения `.env` перезапустите backend, client и admin.

---

## Сборка

Каждое приложение собирается отдельно.

```bash
cd backend
npm run build
```

```bash
cd client
npm run build
```

```bash
cd admin
npm run build
```

Результат:

```text
backend/dist
client/dist
admin/dist
```

---

## Тесты

Backend-тесты находятся рядом с backend:

```text
backend/tests/api.test.mjs
```

Запуск:

```bash
cd backend
npm test
```

Тесты проверяют:

- защиту admin API;
- `401` без токена;
- `401` с невалидным токеном;
- `403` без роли admin;
- refresh token rotation;
- logout;
- CORS;
- импорт Excel;
- маскировку СНИЛС;
- формы обучения `Очная`, `Заочная`, `Очно-заочная`;
- экспорт Excel и жёлтую подсветку внебюджета.

---

## Формат Excel

Основной формат — единый реестр заявлений с колонками:

- `Специальность`
- `Форма обучения`
- `СНИЛС абитуриента`
- `Средний балл аттестата`
- `Фамилия абитуриента`
- `Имя абитуриента`
- `Отчество абитуриента`
- `Статус заявления`

Форма обучения нормализуется к значениям:

```text
Очная
Заочная
Очно-заочная
```

Если одна специальность встречается с разными формами обучения, создаются разные списки.

---

## Авторизация

Администраторы хранятся в таблице `users`, а не в `.env`.

Поля пользователя:

- `id`
- `email`
- `password_hash`
- `role`

Для админки нужна роль `admin`.

Сессия работает так:

1. Админ входит по email и паролю.
2. Backend выдаёт короткоживущий access token.
3. Refresh token сохраняется в `httpOnly` cookie.
4. При `401` admin-приложение вызывает `/api/auth/refresh`.
5. Backend выдаёт новый access token.
6. Исходный запрос повторяется автоматически.

---

## Production

Рекомендуемая схема:

```text
client:  https://example.ru
admin:   https://admin.example.ru
backend: https://api.example.ru
```

Production `.env`:

```env
AUTH_SECRET=очень_длинный_секрет
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/college_rating
APP_ORIGIN=https://example.ru,https://admin.example.ru
VITE_API_URL=https://api.example.ru
```

Важно: `VITE_API_URL` вшивается во frontend во время сборки, поэтому задайте его до `npm run build` в `client` и `admin`.

---

## Git

В Git не должны попадать:

- `.env`
- `node_modules`
- `backend/node_modules`
- `client/node_modules`
- `admin/node_modules`
- `backend/dist`
- `client/dist`
- `admin/dist`
- `data`
- `outputs`

Первый push:

```bash
git add .
git commit -m "Split backend client admin apps"
git branch -M main
git remote add origin https://github.com/LOGIN/REPO.git
git push -u origin main
```
