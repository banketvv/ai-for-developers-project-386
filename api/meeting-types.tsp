using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallScheduler;

/**
 * Типы встреч и их слоты. Слоты не хранятся: сервер вычисляет их из
 * постоянного расписания владельца (пн–пт, 09:00–18:00 в его часовом поясе)
 * и длительности типа. Занятость общая для всех типов: владелец один.
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

  @get
  @route("/{meeting_type_id}/slots")
  @summary("Все слоты 14-дневного окна, включая занятые")
  slots(
    @path meeting_type_id: integer,
  ): SlotsRead | NotFoundResponse | ValidationFailedResponse;
}
