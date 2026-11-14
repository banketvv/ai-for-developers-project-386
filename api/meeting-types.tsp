using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallScheduler;

/**
 * Типы встреч и их слоты. Слоты не хранятся: сервер вычисляет их из
 * постоянного расписания владельца (пн–пт, 09:00–18:00 в часовом поясе
 * `OWNER_TIMEZONE`, по умолчанию `Europe/Moscow`) и длительности типа.
 * Занятость общая для всех типов: владелец один.
 */
@route("/api/v1/meeting-types")
@tag("meeting-types")
interface MeetingTypeRoutes {
  @get
  @summary("Список типов встреч, новые сверху")
  list(): MeetingTypeRead[];

  @post
  @summary("Создать тип встречи")
  create(
    @body payload: MeetingTypeCreate,
  ): CreatedMeetingType | ForbiddenResponse | ValidationFailedResponse;

  @get
  @route("/{meeting_type_id}")
  @summary("Один тип встречи")
  read(
    @path meeting_type_id: integer,
  ): MeetingTypeRead | NotFoundResponse | ValidationFailedResponse;

  @patch
  @route("/{meeting_type_id}")
  @summary("Править тип встречи")
  update(
    @path meeting_type_id: integer,
    @body payload: MeetingTypeUpdate,
  ): MeetingTypeRead | ForbiddenResponse | NotFoundResponse | ConflictResponse | ValidationFailedResponse;

  @delete
  @route("/{meeting_type_id}")
  @summary("Удалить тип встречи вместе с его бронями")
  remove(
    @path meeting_type_id: integer,
  ): NoContentResponse | ForbiddenResponse | NotFoundResponse | ValidationFailedResponse;

  /**
   * Все слоты фиксированного окна, включая занятые.
   *
   * Окно начинается в день запроса в часовом поясе владельца
   * (`OWNER_TIMEZONE`, по умолчанию `Europe/Moscow`) и занимает 14
   * календарных дней: сегодня и следующие 13 дней. Слоты строятся только
   * в будни с 09:00 до 18:00 по этому поясу с шагом, равным
   * `duration_minutes` типа встречи. Слот, который не помещается в рабочий
   * день целиком, отбрасывается; прошедшие слоты не отдаются.
   */
  @get
  @route("/{meeting_type_id}/slots")
  @summary("Все слоты 14-дневного окна, включая занятые")
  slots(
    @path meeting_type_id: integer,
  ): SlotsRead | NotFoundResponse | ValidationFailedResponse;
}
