# Микросервисная архитектура для управления заказами

Простая система на Node.js с микросервисной архитектурой. Включает API Gateway, сервис пользователей и сервис заказов.

## Что внутри

- **API Gateway** - входная точка, маршрутизация запросов
- **Users Service** - регистрация, авторизация, профили
- **Orders Service** - создание и управление заказами

## Технологии

- Node.js + Express
- JWT для авторизации
- Circuit Breaker (opossum)
- Pino для логирования
- Jest для тестов
- Docker + Docker Compose

## Быстрый старт

### Вариант 1: Docker (рекомендуется)

```bash
# Клонировать репозиторий
git clone <url>
cd micro-task-template

# Поднять все сервисы
docker-compose up --build

# API будет доступен на http://localhost:8000
```

### Вариант 2: Локально

Требуется Node.js 18+

```bash
# Установить зависимости для всех сервисов
cd service_users && npm install && cd ..
cd service_orders && npm install && cd ..
cd api_gateway && npm install && cd ..

# Создать .env файл
echo NODE_ENV=development > .env
echo JWT_SECRET=your-secret-key >> .env
echo LOG_LEVEL=debug >> .env

# Запустить сервисы (в отдельных терминалах)
cd service_users && npm start
cd service_orders && npm start
cd api_gateway && npm start
```

## API эндпоинты

### Регистрация и вход

```bash
# Регистрация
POST /v1/users/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Иван Иванов"
}

# Вход
POST /v1/users/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Профиль пользователя

```bash
# Получить профиль (требуется токен)
GET /v1/users/profile
Authorization: Bearer <token>

# Обновить профиль
PUT /v1/users/profile
Authorization: Bearer <token>
{
  "name": "Новое имя"
}
```

### Заказы

```bash
# Создать заказ
POST /v1/orders
Authorization: Bearer <token>
{
  "items": [
    {
      "productId": "prod-001",
      "productName": "Кирпич",
      "quantity": 1000,
      "price": 15.50
    }
  ]
}

# Получить свои заказы
GET /v1/orders?page=1&limit=10
Authorization: Bearer <token>

# Получить заказ по ID
GET /v1/orders/{orderId}
Authorization: Bearer <token>

# Обновить статус
PUT /v1/orders/{orderId}
Authorization: Bearer <token>
{
  "status": "in_progress"
}

# Отменить заказ
DELETE /v1/orders/{orderId}
Authorization: Bearer <token>
```

### Служебные эндпоинты

```bash
# Проверка здоровья
GET /health

# Детальный статус
GET /status
```

## Тестирование

```bash
# Запустить тесты для всех сервисов
cd service_users && npm test
cd service_orders && npm test
cd api_gateway && npm test

# С покрытием кода
npm run test:coverage

# В режиме разработки
npm run test:watch
```

## Postman коллекция

Импортируйте файл `docs/postman-collection.json` в Postman для быстрого тестирования API.

## Переменные окружения

Создайте `.env` файл в корне проекта:

```env
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
LOG_LEVEL=debug

# URLs сервисов (для локального запуска)
USERS_SERVICE_URL=http://localhost:8001
ORDERS_SERVICE_URL=http://localhost:8002
```

## Структура проекта

```
micro-task-template/
├── api_gateway/          # API Gateway
│   ├── index.js
│   ├── utils/
│   │   └── logger.js
│   ├── package.json
│   └── __tests__/
├── service_users/        # Сервис пользователей
│   ├── index.js
│   ├── utils/
│   ├── package.json
│   └── __tests__/
├── service_orders/       # Сервис заказов
│   ├── index.js
│   ├── utils/
│   ├── package.json
│   └── __tests__/
├── docs/                 # Документация
│   ├── openapi.yaml
│   └── postman-collection.json
├── docker-compose.yml
└── .env
```

## Как это работает

1. **API Gateway** принимает все запросы на порту 8000
2. Проверяет JWT токены для защищенных эндпоинтов
3. Перенаправляет запросы к соответствующим сервисам
4. Circuit Breaker защищает от каскадных сбоев
5. Все запросы логируются с уникальным Request ID

## Circuit Breaker

Используется библиотека `opossum`. Если сервис недоступен:
- После 50% ошибок - цепь размыкается
- 30 секунд - время восстановления
- Возвращается fallback ответ вместо ошибки

## Логирование

Все логи в JSON формате (Pino). Каждый запрос получает уникальный ID для трейсинга.

```bash
# Посмотреть логи в Docker
docker-compose logs -f api_gateway
docker-compose logs -f service_users
docker-compose logs -f service_orders
```

## Rate Limiting

- Общие эндпоинты: 100 запросов за 15 минут
- Авторизация/регистрация: 5 попыток за 15 минут

## Роли пользователей

- `user` - обычный пользователь (может управлять своими заказами)
- `manager` - менеджер (может видеть заказы других)
- `admin` - администратор (полный доступ)

## Проблемы и решения

### Не запускается Docker

```bash
# Проверить версию Docker
docker --version

# Очистить старые контейнеры
docker-compose down -v
docker-compose up --build
```

### Ошибка 403 при установке WSL

Запустите PowerShell от имени администратора:
```powershell
wsl --update
```

### Порт уже занят

```bash
# Найти процесс на порту 8000
netstat -ano | findstr :8000

# Убить процесс (замените PID)
taskkill /PID <PID> /F

# Или измените порты в docker-compose.yml
```

## Разработка

### Добавление нового сервиса

1. Создайте папку сервиса
2. Скопируйте структуру из существующего
3. Добавьте в `docker-compose.yml`
4. Добавьте роут в API Gateway

### Формат ответов

Все ответы в едином формате:

```javascript
// Успех
{
  "success": true,
  "data": { ... }
}

// Ошибка
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Описание ошибки"
  }
}
```

## Production

Для production окружения:

1. Сгенерируйте надежный JWT_SECRET
2. Используйте HTTPS
3. Настройте reverse proxy (nginx)
4. Включите rate limiting на уровне nginx
5. Настройте мониторинг (Prometheus + Grafana)
6. Используйте внешнюю БД вместо in-memory хранилища

```bash
# Генерация секрета
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Лицензия

MIT

## Автор

Ваше имя

## Поддержка

При возникновении проблем создавайте Issue в репозитории.