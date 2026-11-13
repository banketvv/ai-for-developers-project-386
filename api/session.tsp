using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallScheduler;

/**
 * Сессия смотрящего. Аутентификации нет: сервис узнаёт владельца по почте
 * и хранит её в HttpOnly-cookie `guest_email` на 30 дней.
 */
@route("/api/v1/session")
@tag("session")
interface SessionRoutes {
  @get
  @summary("Кто смотрит сервис и владелец ли он")
  read(): SessionRead;

  @post
  @summary("Вход владельца по почте")
  login(@body payload: SessionLogin): NoContentResponse | ForbiddenResponse | ValidationFailedResponse;

  @delete
  @summary("Сменить почту: очистить cookie")
  logout(): NoContentResponse;
}
