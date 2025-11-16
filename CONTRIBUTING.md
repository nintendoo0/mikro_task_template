# Руководство по разработке

## Начало работы

```bash
git clone <repository>
cd micro-task-template
npm install
```

## Стиль кода

Используем стандартный JS style guide. Основные правила:

- Отступы: 4 пробела
- Точка с запятой: обязательно
- Одинарные кавычки для строк
- camelCase для переменных
- UPPER_CASE для констант

## Коммиты

Формат сообщений:

```
type: краткое описание

Подробное описание изменений (опционально)
```

Типы:
- `feat` - новая функциональность
- `fix` - исправление бага
- `docs` - изменения в документации
- `test` - добавление тестов
- `refactor` - рефакторинг кода
- `chore` - рутинные задачи

Примеры:
```
feat: добавлен эндпоинт для фильтрации заказов по дате
fix: исправлена утечка памяти в логгере
docs: обновлена документация API
```

## Ветки

- `main` - стабильная версия
- `develop` - разработка
- `feature/название` - новая фича
- `fix/название` - исправление

## Pull Request

1. Создайте ветку от `develop`
2. Напишите код
3. Добавьте тесты
4. Убедитесь что все тесты проходят
5. Создайте PR в `develop`

## Тестирование

Перед коммитом:

```bash
# Запустить все тесты
npm test

# Проверить покрытие
npm run test:coverage

# Линтинг (если настроен)
npm run lint
```

Покрытие должно быть минимум 70%.

## Работа с зависимостями

```bash
# Добавить зависимость
npm install package-name

# Добавить dev зависимость
npm install -D package-name

# Обновить зависимости
npm update

# Проверить уязвимости
npm audit
```

## Логирование

Используйте logger вместо console.log:

```javascript
const logger = require('./utils/logger');

// Правильно
logger.info('User registered', { userId, email });
logger.error('Database error', { error: error.message });

// Неправильно
console.log('User registered');
```

## Обработка ошибок

Всегда возвращайте стандартизированный формат:

```javascript
res.status(400).json({
    success: false,
    error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format'
    }
});
```

## Вопросы

Есть вопросы? Пишите в Issues или Telegram чат команды.