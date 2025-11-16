# Архитектура системы

## Общая схема

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│   API Gateway       │ :8000
│  Circuit Breaker    │
│  Rate Limiting      │
│  JWT Validation     │
└──────┬──────────────┘
       │
       ├─────────────────┬──────────────┐
       ▼                 ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌────────┐
│Users Service │  │Orders Service│  │Future  │
│    :8001     │  │    :8002     │  │Services│
└──────────────┘  └──────────────┘  └────────┘
```

## Компоненты

### API Gateway
- Единая точка входа
- JWT авторизация
- Rate limiting
- Circuit breaker
- Агрегация данных

### Users Service
- Регистрация/авторизация
- Управление профилями
- Генерация JWT токенов
- In-memory хранилище пользователей

### Orders Service
- CRUD операций с заказами
- Валидация данных
- Проверка прав доступа
- Интеграция с Users Service

## Паттерны

### Circuit Breaker
Защита от каскадных сбоев:
- Timeout: 5 секунд
- Порог ошибок: 50%
- Время восстановления: 30 секунд

### Request ID Tracing
Каждый запрос получает уникальный ID для отслеживания в логах.

### Centralized Logging
Структурированные JSON логи через Pino.

## Безопасность

1. JWT токены с коротким временем жизни
2. bcrypt для хеширования паролей
3. Helmet для HTTP headers
4. CORS настройки
5. Rate limiting
6. Валидация входных данных

## Масштабирование

Сервисы независимы и могут масштабироваться отдельно:

```bash
docker-compose up --scale service_orders=3
```

Для production рекомендуется:
- Load balancer (nginx)
- Service mesh (Istio)
- База данных (PostgreSQL/MongoDB)
- Message queue (RabbitMQ/Kafka)
- Cache layer (Redis)

## Мониторинг

Рекомендуемый стек:
- Prometheus - сбор метрик
- Grafana - визуализация
- ELK Stack - логи
- Jaeger - distributed tracing

## Будущее развитие

- [ ] Добавить базу данных
- [ ] Notifications service
- [ ] File upload service
- [ ] WebSocket для real-time
- [ ] GraphQL API
- [ ] Kubernetes деплой