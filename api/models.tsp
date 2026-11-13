using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallScheduler;

/** Длительность встречи в минутах: владелец выбирает из набора. */
union DurationMinutes {
  m15: 15,
  m30: 30,
  m45: 45,
  m60: 60,
}

/** Единый конверт ошибки: клиент различает причины по машинному коду. */
model ApiError {
  /** Машинный код: `validation_error`, `forbidden`, `not_found`, `slot_taken`, `already_booked`, `duration_locked`. */
  code: string;
  /** Человекочитаемое сообщение для показа рядом с формой или экраном. */
  message: string;
  /** Ошибки конкретных полей: имя поля → сообщение. */
  fields?: Record<string>;
}

/** Тело любого неуспешного ответа API. */
model ErrorResponse {
  error: ApiError;
}

model NotFoundResponse {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
}

model ForbiddenResponse {
  @statusCode statusCode: 403;
  @body body: ErrorResponse;
}

model ConflictResponse {
  @statusCode statusCode: 409;
  @body body: ErrorResponse;
}

model ValidationFailedResponse {
  @statusCode statusCode: 422;
  @body body: ErrorResponse;
}

model NoContentResponse {
  @statusCode statusCode: 204;
}

model HealthRead {
  /** Всегда `ok`, пока сервис отвечает. */
  status: string;
}

model SessionRead {
  /** Почта смотрящего из cookie; `null`, если cookie нет. */
  email: string | null;
  /** Совпадает ли почта смотрящего с почтой владельца. */
  is_owner: boolean;
  /** Имя владельца из настроек сервиса. */
  owner_name: string;
}

model SessionLogin {
  /** Почта, по которой владелец входит в сервис. */
  @minLength(1)
  @maxLength(320)
  @format("email")
  email: string;
}

model MeetingTypeRead {
  id: integer;
  /** Название типа встречи, 1–100 символов после обрезки. */
  title: string;
  /** Описание до 1000 символов; `null`, если владелец его не задал. */
  description: string | null;
  duration_minutes: DurationMinutes;
  created_at: utcDateTime;
  /** Сколько броней привязано к типу: нужно предупреждению об удалении. */
  bookings_count: integer;
  /** Есть ли в 14-дневном окне хотя бы один свободный слот. */
  has_available_slots: boolean;
  /** Заперта ли длительность: у типа есть предстоящие брони. */
  duration_locked: boolean;
}

model CreatedMeetingType {
  @statusCode statusCode: 201;
  @body body: MeetingTypeRead;
}

model MeetingTypeCreate {
  /** Название, 1–100 символов после обрезки. */
  @minLength(1)
  @maxLength(100)
  title: string;
  /** Необязательное описание до 1000 символов; пустая строка означает «без описания». */
  @maxLength(1000)
  description?: string | null;
  duration_minutes?: DurationMinutes = 30;
}

model MeetingTypeUpdate {
  /** Название, 1–100 символов после обрезки; `null` недопустим. */
  @minLength(1)
  @maxLength(100)
  title?: string;
  /** Описание до 1000 символов; `null` и пустая строка означают «без описания». */
  @maxLength(1000)
  description?: string | null;
  /** Длительность меняется только без предстоящих броней. */
  duration_minutes?: DurationMinutes;
}

model SlotRead {
  /** Начало слота в UTC с суффиксом `Z`. */
  start: utcDateTime;
  /** `false`, если слот пересекается с предстоящей бронью любого типа. */
  available: boolean;
}

model SlotsRead {
  /** Все слоты фиксированного 14-дневного окна, включая занятые. */
  slots: SlotRead[];
}

model BookingMeetingTypeRead {
  id: integer;
  title: string;
  duration_minutes: DurationMinutes;
}

model BookingRead {
  /** Номер брони, который гость видит на подтверждении. */
  id: integer;
  /** Начало слота в UTC с суффиксом `Z`. */
  start: utcDateTime;
  guest_name: string;
  guest_email: string;
  created_at: utcDateTime;
  meeting_type: BookingMeetingTypeRead;
}

model CreatedBooking {
  @statusCode statusCode: 201;
  @body body: BookingRead;
}

model BookingCreate {
  meeting_type_id: integer;
  /** Начало слота: обязан совпадать со слотом текущей сетки типа. */
  start: utcDateTime;
  /** Имя гостя, 1–100 символов после обрезки. */
  @minLength(1)
  @maxLength(100)
  guest_name: string;
  /** Почта гостя: сравнивается с точностью до нормализации (обрезка, нижний регистр). */
  @maxLength(320)
  @format("email")
  guest_email: string;
}
