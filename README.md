# Рейтинг абитуриентов колледжа

Веб-система для публикации рейтингов абитуриентов из Excel-файлов и внутреннего учёта оригиналов документов.

Проект разделён на три независимых приложения:

- `apps/backend` — API, авторизация, PostgreSQL, бизнес-логика, импорт/экспорт Excel.
- `apps/client` — публичное приложение для абитуриентов.
- `apps/admin` — отдельная админ-панель для сотрудников.

---

## Возможности

### Публичное приложение

- Поиск абитуриента по полному СНИЛС.
- Отображение СНИЛС только в маске: первые 3 и последние 3 цифры.
- Просмотр списков поступающих по специальностям.
- Разделение одинаковых специальностей по форме обучения: `Очная` и `Заочная`.
- Отображение бюджетных и внебюджетных мест.
- Отображение отметки, принесён оригинал документа или нет.

### Админ-панель

- Вход сотрудника через email и пароль.
- Загрузка Excel-файла с реестром заявлений.
- Автоматическое распределение абитуриентов по специальностям и форме обучения.
- Поиск абитуриентов по ФИО, СНИЛС, коду или части названия специальности.
- Отметка оригинала документа.
- Отметка первоочередного зачисления.
- Редактирование количества бюджетных и внебюджетных мест.
- Выгрузка Excel-файла по каждой специальности для абитуриентов с оригиналом.
- Удаление всех опубликованных специальностей.

---

## Технологии

- React
- TypeScript
- Vite
- Express
- PostgreSQL
- JWT access token
- Refresh token в `httpOnly` cookie
- Excel import через `xlsx`
- Excel export через `exceljs`

---

## Структура проекта

```text
apps/
  backend/
    src/
      controllers/
      lib/
      middlewares/
      migrations/
      routes/
      services/
      index.ts
      migrate.ts
      seed-admin.ts
  client/
    src/
      App.tsx
      api.ts
      main.tsx
      styles.css
      types.ts
  admin/
    src/
      App.tsx
      api.ts
      main.tsx
      styles.css
      types.ts
scripts/
  api.test.mjs
  transfer-sqlite-to-postgres.ts
```

---

## Быстрый запуск локально

### 1. Установить зависимости

```bash
npm install
```

### 2. Создать `.env`

```bash
cp .env.example .env
```

Пример `.env`:

```env
AUTH_SECRET=change-this-long-secret
PORT=3001
DATABASE_URL=postgresql://college_app:local-development-password@127.0.0.1:5432/college_rating
APP_ORIGIN=http://localhost:5173,http://localhost:5174
VITE_API_URL=http://localhost:3001
```

Для `AUTH_SECRET` лучше сгенерировать длинную строку:

```bash
openssl rand -hex 32
```

### 3. Запустить PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Применить миграции

```bash
npm run db:migrate
```

### 5. Создать администратора

```bash
npm run admin:create -- admin@example.com strong-password
```

Если пользователь с таким email уже есть, команда обновит пароль и назначит роль `admin`.

### 6. Запустить приложения

В трёх разных терминалах:

```bash
npm run dev:backend
```

```bash
npm run dev:client
```

```bash
npm run dev:admin
```

Адреса по умолчанию:

- Backend API: `http://localhost:3001`
- Client: `http://localhost:5173`
- Admin: `http://localhost:5174`

---

## Авторизация

Администраторы больше не создаются через `ADMIN_PASSWORD`.

Теперь администратор хранится в таблице `users`:

- `id`
- `email`
- `password_hash`
- `role`

Для админки нужна роль `admin`.

### Как работает сессия

1. Админ вводит email и пароль.
2. Backend выдаёт короткоживущий access token.
3. Refresh token сохраняется в `httpOnly` cookie.
4. Если access token истёк, admin-приложение вызывает `/api/auth/refresh`.
5. Backend проверяет refresh token и выдаёт новый access token.
6. Исходный запрос повторяется автоматически.

### Защита admin API

Админские маршруты проверяют:

- наличие access token;
- валидность JWT;
- срок действия JWT;
- роль пользователя `admin`.

Ожидаемые ответы:

- без токена — `401 Unauthorized`;
- невалидный токен — `401 Unauthorized`;
- нет роли `admin` — `403 Forbidden`.

---

## Формат Excel-файла

Поддерживаются `.xls` и `.xlsx`.

Основной формат — единый реестр заявлений с колонками:

- `Специальность`
- `Форма обучения`
- `СНИЛС абитуриента`
- `Средний балл аттестата`
- `Фамилия абитуриента`
- `Имя абитуриента`
- `Отчество абитуриента`
- `Статус заявления` — может быть в файле, но на публичном сайте не отображается

Система группирует записи по паре:

```text
Специальность + Форма обучения
```

Если одна специальность есть в очной и заочной форме, создаются два отдельных списка.

---

## Логика рейтинга

Сортировка внутри специальности:

1. Абитуриенты с оригиналом документа.
2. Среди них — абитуриенты с первоочередным зачислением.
3. Далее сортировка по среднему баллу.
4. Затем по СНИЛС для стабильного порядка.

В публичном списке для первоочередного зачисления в колонке среднего балла показывается текст `первоочередное зачисление`.

В поиске по СНИЛС показывается реальный средний балл.

---

## Проверка проекта

### Сборка всех приложений

```bash
npm run build
```

### Тесты API

```bash
npm test
```

Тесты проверяют:

- защиту админских маршрутов;
- `401` без токена;
- `401` с невалидным токеном;
- `403` без роли admin;
- refresh token;
- импорт Excel;
- поиск;
- оригиналы документов;
- первоочередное зачисление;
- экспорт Excel.

---

## Production

В production обязательно задать:

```env
AUTH_SECRET=длинный_секрет
DATABASE_URL=postgresql://...
APP_ORIGIN=https://site.example,https://admin.example
PORT=3001
```

`ADMIN_PASSWORD` больше не нужен.

После деплоя нужно один раз создать администратора:

```bash
npm run admin:create -- admin@example.com strong-password
```

Секреты нельзя хранить в Git. Их нужно задавать через настройки сервера или панели хостинга.

---

## Git

Перед первым пушем проверьте:

```bash
git status
```

В Git не должны попадать:

- `.env`
- `node_modules`
- `dist`
- `dist-server`
- `data`
- `outputs`

Если remote ещё не добавлен:

```bash
git remote add origin https://github.com/LOGIN/REPO.git
```

Первый пуш:

```bash
git add .
git commit -m "Refactor app architecture and auth"
git branch -M main
git push -u origin main
```

Если появляется ошибка `origin does not appear to be a git repository`, проверьте:

```bash
git remote -v
```

Если origin неправильный:

```bash
git remote set-url origin https://github.com/LOGIN/REPO.git
```

---

## Полезные команды

```bash
npm run dev:backend
npm run dev:client
npm run dev:admin
npm run db:migrate
npm run admin:create -- admin@example.com strong-password
npm run build
npm test
```

---

## Документация

Подробная техническая документация находится в:

```text
docs/PROJECT_DOCUMENTATION.md
```
