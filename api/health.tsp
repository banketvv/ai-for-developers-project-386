using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallScheduler;

/**
 * Инфраструктурная проверка живости сервиса. Живёт в корне, вне `/api/v1`,
 * потому что внешний мониторинг и Hexlet-проверка смотрят именно на неё.
 */
@route("/health")
@tag("health")
@get
@summary("Проверка работоспособности сервиса")
op health(): HealthRead;
