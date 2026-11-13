import "@typespec/http";
import "@typespec/openapi";
import "./models.tsp";
import "./health.tsp";
import "./session.tsp";
import "./meeting-types.tsp";
import "./bookings.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * HTTP API сервиса «Календарь звонков»: один владелец публикует типы встреч,
 * гости записываются на слоты. Аутентификации нет: смотрящего опознаёт cookie
 * `guest_email`, которую сервис ставит после брони или входа владельца.
 */
@service(#{ title: "Call Scheduler API" })
@server("http://localhost:8000", "Локальный сервер")
namespace CallScheduler;
