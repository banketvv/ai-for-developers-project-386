# Время, пояса и DST в стеке Python 3.13 + FastAPI + SQLAlchemy/SQLite + React

Research-заметка к тикету
[#4](https://github.com/banketvv/ai-for-developers-project-386/issues/4).
Вопрос: как хранить и конвертировать время слота, чтобы окно 09:00–18:00
`Europe/Moscow` не съезжало при переходе на летнее время, а браузер показывал
пояс смотрящего.

Ниже — только проверяемые факты со ссылками на первоисточники и результаты
локальных прогонов на этом стеке (Python 3.13.1, SQLAlchemy 2.1.8, SQLite
3.45.3, Windows).

## Коротко

- **Хранится момент, а не настенное время.** В БД — UTC; пояс владельца
  (`Europe/Moscow`) — константа расписания; пояс смотрящего нужен только для
  отображения.
- **Смещение считается по дате слота**, а не «сейчас»:
  `datetime(..., tzinfo=ZoneInfo("Europe/Moscow")).astimezone(UTC)`.
- **SQLite не хранит пояс.** `DateTime(timezone=True)` на SQLite рендерится как
  `DATETIME` и молча теряет `tzinfo`: `2026-11-13 09:00+03:00` ложится в БД как
  `2026-11-13 09:00:00.000000`, а не как `06:00`. Проверено локально.
- **`ZoneInfo` на Windows без пакета `tzdata` падает** с
  `ZoneInfoNotFoundError`. В `backend/pyproject.toml` зависимости `tzdata` сейчас
  нет — это отдельный факт для тикета реализации.
- **`Europe/Moscow` с 2014-10-26 — фиксированные UTC+3 без DST**, но код всё
  равно обязан брать смещение из tzdb по дате: правила меняются политически.
- **В браузере** — `Intl.DateTimeFormat` с `timeZone` из
  `resolvedOptions().timeZone`; `Temporal` пока не Baseline.

## 1. `zoneinfo` в Python 3.13

### 1.1. Как получить смещение для будущей даты

`ZoneInfo` — реализация `datetime.tzinfo` поверх базы IANA
([docs.python.org/3.13/library/zoneinfo.html](https://docs.python.org/3.13/library/zoneinfo.html)).
Смещение вычисляется не «на сегодня», а для конкретного `datetime`, который
несёт этот `tzinfo`:

```python
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")
slot = datetime(2027, 3, 29, 9, 0, tzinfo=MSK)  # стенные 09:00 в поясе владельца
assert slot.utcoffset().total_seconds() == 3 * 3600
assert slot.astimezone(UTC).hour == 6
```

- `datetime.utcoffset()` возвращает `self.tzinfo.utcoffset(self)`, то есть
  смещение именно для этих полей даты/времени
  ([datetime.utcoffset()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.utcoffset)).
- `dst()` для `ZoneInfo` возвращает `timedelta(0)`, когда DST не действует; для
  исторических дат Москвы он тоже `0`, потому что в 2011–2014 Россия жила на
  постоянном «летнем» UTC+4, а не переключалась
  ([tzdb `europe`](https://data.iana.org/time-zones/tzdb/europe)).
- Конструктор `datetime(..., tzinfo=ZoneInfo(...))` **не проверяет**, существует
  ли такое настенное время: для «дыры» при переводе часов он просто применит
  смещение по правилу `fold` (см. ниже). Перевод в UTC через `astimezone()`
  использует `tzinfo` и даёт корректный момент для существующего времени.

### 1.2. Что такое `fold`

`fold` — атрибут `datetime`/`time` из
[PEP 495](https://peps.python.org/pep-0495/), значения `0` и `1`. Он различает
два одинаковых настенных времени, которые возникают, когда часы переводят назад
(«складка», fold), и задаёт, какое правило применять к несуществующему времени
в «дыре» (gap):

| ситуация | `fold=0` | `fold=1` |
| --- | --- | --- |
| неоднозначное время (часы назад) | смещение **до** перехода (раньше) | смещение **после** перехода (позже) |
| несуществующее время (часы вперёд) | смещение **до** перехода | смещение **после** перехода |

Это дословно таблица из PEP 495, раздел «Summary of Rules at a Transition», и
она же описана в документации `zoneinfo`: «the offset from *before* the
transition is used when `fold=0`, and the offset *after* the transition is used
when `fold=1`».

Важные следствия:

- `astimezone()` и `fromtimestamp(ts, tz)` выставляют `fold` правильно, поэтому
  конвертация **из** UTC однозначна: один момент → одно настенное время.
- Конвертация **в** UTC из настенного времени неоднозначна, если время попало в
  складку или дыру; `fold` — это выбор пользователя/политики, а не вычисление.
- Сравнение двух aware-`datetime` с **одинаковым** `tzinfo` игнорирует `fold` и
  сравнивает поля; поэтому два `01:30` в складке равны, пока их не привели к UTC
  ([правила сравнения](https://docs.python.org/3.13/library/datetime.html#datetime.datetime)).
- `timedelta` не переносит `fold`: результат сложения всегда `fold=0` (PEP 495).

Для окна 09:00–18:00 в `Europe/Moscow` складок и дыр в будущем нет, но код не
должен на это опираться: смещение всё равно берётся из `ZoneInfo` по дате.

### 1.3. Почему `datetime.now(tz)` — не «сейчас в UTC»

`datetime.now(tz)` возвращает **тот же текущий момент**, но представленный в
поясе `tz`: другие поля и другое смещение.

```python
utc = datetime.now(UTC)
msk = utc.astimezone(MSK)
assert utc == msk        # True: aware-сравнение идёт по моменту
assert utc.isoformat() != msk.isoformat()
```

- По документации `datetime.now(tz)` — «current date and time … converted to
  *tz*’s time zone»
  ([datetime.now()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.now)).
  PEP 495 уточняет, что `datetime.now(tz)` эквивалентен
  `datetime.now().astimezone(tz)`.
- Два **отдельных** вызова `now()` дают разные моменты (разница в микросекундах),
  поэтому `datetime.now(UTC) == datetime.now(MSK)` в тесте может быть `False` не
  из-за пояса, а из-за времени вызова. Сравнивать надо один снимок, приведённый
  к двум поясам.
- `datetime.utcnow()` возвращает **naive** UTC и объявлен deprecated с 3.12;
  рекомендуемая замена — `datetime.now(UTC)`
  ([utcnow()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.utcnow)).
- Naive и aware никогда не равны, а сравнение порядка между ними бросает
  `TypeError`; naive-время трактуется многими методами как системное локальное
  ([Aware and Naive Objects](https://docs.python.org/3.13/library/datetime.html#aware-and-naive-objects)).
- `astimezone()` на naive-значении **подставляет системный пояс машины**, а не
  UTC
  ([astimezone()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.astimezone)).
  На сервере в UTC это случайно совпадёт, на машине разработчика — нет.

Практический вывод: «сейчас» для фильтра прошедших слотов — это
`datetime.now(UTC)` (aware), а не `datetime.now()` и не `datetime.utcnow()`.

### 1.4. Арифметика: стенные сутки ≠ 24 часа

Для «каждый день в 09:00 по поясу владельца» нужна календарная арифметика в
поясе, а не прибавление 24 часов к UTC-моменту:

```python
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

start = datetime(2026, 3, 28, 9, 0, tzinfo=ZoneInfo("Europe/Berlin"))
print(start + timedelta(days=1))                     # 2026-03-29 09:00+02:00
print((start.astimezone(UTC) + timedelta(hours=24)).astimezone(ZoneInfo("Europe/Berlin")))
# 2026-03-29 10:00+02:00 — местное время съехало
```

Это проверено локально: в берлинской зоне на переходе 2026-03-29 прибавление
суток к aware-времени сохраняет 09:00, а прибавление 24 часов к UTC-моменту даёт
10:00. Для Москвы сегодня разницы нет (нет перехода), но правило должно быть
общим.

### 1.5. Windows и `tzdata`

Документация `zoneinfo` прямо предупреждает: на Windows системной базы IANA нет,
и без пакета `tzdata` конструктор бросает `ZoneInfoNotFoundError`; для
кросс-платформенности рекомендуется объявить зависимость от `tzdata`.

Локальная проверка на этом репозитории (Windows, `uv run` из `backend/`):

```text
zoneinfo._common.ZoneInfoNotFoundError: 'No time zone found with key Europe/Moscow'
```

Тот же скрипт с `uv run --with tzdata` работает. В `backend/pyproject.toml`
сейчас есть `aiosqlite`, `alembic`, `fastapi`, `pydantic-settings`,
`sqlalchemy[asyncio]`, но **нет** `tzdata`. Это не проблема этой research-задачи,
но факт, который реализация обязана учесть.

## 2. `Europe/Moscow`: исторические правила

Первоисточник — файл
[`europe` базы IANA](https://data.iana.org/time-zones/tzdb/europe). Определение
зоны (актуальная редакция):

```text
Zone Europe/Moscow  2:30:17 - LMT 1880
                    2:30:17 - MMT 1916 Jul 3
                    ...
                    3:00 Russia MSK/MSD 2011 Mar 27 2:00s
                    4:00 - MSK 2014 Oct 26 2:00s
                    3:00 - MSK
```

Что это значит:

- До 2011 года в зоне действовали правила `Russia` (с историческими перерывами
  и особыми периодами); в 1981–2010 они включали ежегодный переход на летнее
  время.
- Переход 2011-03-27 сделал «летнее» время постоянным: Москва оказалась на
  UTC+4 (`4:00 - MSK`, без правила). Закон июня 2011 года отменил возврат на
  зимнее время — это зафиксировано в комментариях того же файла.
- С **2014-10-26 02:00s** Москва — постоянный **UTC+3** (`3:00 - MSK`), снова без
  правила. С тех пор DST в `Europe/Moscow` не наступает.
- Последнее правило `Russia` в файле — `1996 2010` для возврата на зимнее время и
  `1985 2010` для перехода на летнее; после 2010 правило не применяется.

Локальная проверка (Python 3.13.1, `tzdata`):

| дата слота 09:00 | `utcoffset()` | `dst()` | UTC |
| --- | --- | --- | --- |
| 2011-07-01 | +04:00 | 0:00 | 05:00 |
| 2013-01-01 | +04:00 | 0:00 | 05:00 |
| 2026-11-13 | +03:00 | 0:00 | 06:00 |
| 2027-03-28 | +03:00 | 0:00 | 06:00 |

Вывод: **для будущих слотов смещение Москвы сегодня всегда +03:00**, и «переход
на летнее время» в этой зоне не наступит. Но именно поэтому нельзя зашивать
`+03:00` числом: tzdb меняется, а правила «политические, а не рациональные»
(формулировка документации `datetime`
[про `tzinfo`](https://docs.python.org/3.13/library/datetime.html#tzinfo-objects)).
Код должен вызывать `ZoneInfo` для даты слота; тогда будущее изменение правил
Москвы подхватится обновлением `tzdata`, а не правкой константы.

Отдельный риск — рассинхрон версий tzdb между сервером и браузером. MDN
описывает это как «offset ambiguity»: для будущих меток сервер и браузер с
разными версиями базы могут дать разные смещения
([Temporal.ZonedDateTime, Offset ambiguity](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime#offset_ambiguity)).
Для горизонта в 14 дней риск мал, но версию `tzdata` стоит фиксировать.

## 3. SQLAlchemy + SQLite

### 3.1. Как SQLite хранит даты

В SQLite **нет** отдельного типа для даты/времени. Есть пять storage classes:
`NULL`, `INTEGER`, `REAL`, `TEXT`, `BLOB`; даты рекомендовано хранить как TEXT в
ISO 8601, как REAL (юлианские дни) или как INTEGER (Unix time)
([Datatypes In SQLite, §2.2](https://www.sqlite.org/datatype3.html)).
Объявленный тип колонки задаёт только «affinity», а не реальный тип значения.

SQLAlchemy для SQLite хранит `DateTime` **строкой** и сам конвертирует её
обратно; встроенных типов даты у pysqlite нет
([SQLAlchemy SQLite: Date and Time Types](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#date-and-time-types)).
Формат по умолчанию:

```text
"%(year)04d-%(month)02d-%(day)02d %(hour)02d:%(minute)02d:%(second)02d.%(microsecond)06d"
например: 2021-03-15 12:05:57.105542
```

Обратный разбор — `datetime.fromisoformat()`
([sqlite.DATETIME](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#sqlalchemy.dialects.sqlite.DATETIME)).
В формате **нет смещения UTC**, поэтому прочитанное значение — naive.

### 3.2. `DateTime(timezone=True)` vs наивный

Документация SQLAlchemy: флаг `timezone` «indicates that the datetime type should
enable timezone support, **if available on the base date/time-holding type
only**»; если бэкенд не поддерживает пояс, флаг игнорируется
([DateTime](https://docs.sqlalchemy.org/en/20/core/type_basics.html#sqlalchemy.types.DateTime),
[TIMESTAMP](https://docs.sqlalchemy.org/en/20/core/type_basics.html#sqlalchemy.types.TIMESTAMP)).
SQLite пояса не поддерживает.

Проверено на этом стеке:

```text
DDL:            DATETIME
Запись aware:   2026-11-13 09:00:00.000000   (typeof = text)
Чтение:         datetime.datetime(2026, 11, 13, 9, 0), tzinfo=None
```

То есть:

- `DateTime(timezone=True)` и `DateTime` на SQLite дают **одинаковый** DDL и
  одинаковое хранение; флаг ничего не защищает.
- Если передать aware `09:00+03:00`, SQLAlchemy запишет **09:00**, а не `06:00`.
  Смещение не конвертируется и не сохраняется — оно просто отбрасывается.
- После чтения значение naive; `got == aware` даёт `False`, а сравнение порядка —
  `TypeError`.

Поэтому инвариант «в колонке всегда UTC» обеспечивается кодом, а не типом
колонки. Практические варианты (выбор — не предмет этой заметки):

1. `DateTime(timezone=True)` как декларация намерения + **всегда** писать
   `value.astimezone(UTC)` и **всегда** прикреплять `UTC` при чтении.
2. `Integer` с Unix time (секунды/миллисекунды) — тогда в БД нет ни строки, ни
   неоднозначности, но теряется читаемость SQL.
3. `TypeDecorator`, который принудительно приводит к UTC на записи и возвращает
   aware UTC на чтении — если хочется исключить ошибку в одном месте.

Ловушка переносимости: на PostgreSQL `DateTime(timezone=True)` станет
`TIMESTAMP WITH TIME ZONE` и начнёт вести себя иначе, чем на SQLite. Тесты на
SQLite такого различия не поймают.

### 3.3. Сравнение и сортировка

- SQLite сравнивает TEXT по BINARY-коллации, посимвольно
  ([§4.1 Sort Order](https://www.sqlite.org/datatype3.html),
  [§7 Collating Sequences](https://www.sqlite.org/datatype3.html)). Для
  фиксированного формата `YYYY-MM-DD HH:MM:SS.ffffff` в UTC лексикографический
  порядок совпадает с хронологическим — поэтому `ORDER BY starts_at` работает.
- Порядок **ломается**, если в одной колонке смешаны строки с разными
  смещениями (`+03:00`, `+00:00`) или форматы разной ширины: `2026-11-13
  09:00:00+03:00` и `2026-11-13 06:00:00+00:00` — один момент, но разные строки,
  и сортировка поставит их как разные.
- Порядок также ломается при смешении storage classes: INTEGER/REAL всегда
  меньше TEXT, независимо от значения
  ([§4.1](https://www.sqlite.org/datatype3.html)).
- Объявленный тип `DATETIME` получает **NUMERIC affinity**
  ([§3.1](https://www.sqlite.org/datatype3.html)), но строки SQLAlchemy не
  являются well-formed числами, поэтому остаются TEXT. Если писать в ту же
  колонку целые Unix time, affinity начнёт преобразовывать значения — не
  смешивайте форматы в одной колонке.
- Сравнивать в SQL надо с UTC-значением, а не с локальным: параметр запроса
  приводится к тому же формату, что и колонка.

## 4. Генерация сетки слотов в поясе владельца

Правильная схема (стенные часы задаются в поясе владельца, момент считается
через `astimezone`):

```python
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

def slots_for(day: date) -> list[datetime]:
    return [
        datetime.combine(day, time(hour), tzinfo=MSK).astimezone(UTC)
        for hour in range(9, 18)
    ]
```

- Сетка строится по **календарным датам в поясе владельца**. «Сегодня» для
  владельца — `datetime.now(MSK).date()`, а не `date.today()` сервера: сервер
  может работать в UTC, и вблизи полуночи даты разойдутся.
- Каждый слот сразу переводится в UTC и дальше живёт как момент. Смещение
  подставляется для конкретной даты — это и есть ответ на «не съезжало».
- Фильтр прошедших слотов — сравнение моментов:
  `slot_utc > datetime.now(UTC)`. Сравнивать настенные строки с `now()` нельзя.
- Нельзя генерировать «09:00 UTC + N часов»: при наличии DST это даст сдвиг
  местного времени на час (см. §1.4).
- Длительность слота — это прибавление `timedelta` к моменту (абсолютная
  длительность), а не к настенному времени. Для Москвы разницы нет; в общем
  случае считать надо от момента.
- Если пояс владельца когда-нибудь станет другим (не Москва), 09:00–18:00 может
  попасть в складку/дыру. Тогда нужна явная политика: проверять, что
  `local.astimezone(UTC).astimezone(TZ) == local`, и решать, что делать со
  складкой; `datetime(...)` сам ошибку не бросит.

## 5. Браузер: пояс смотрящего и подписи

### 5.1. Как узнать пояс

```js
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// например "Europe/Berlin"
```

`resolvedOptions().timeZone` — IANA-имя, «the default is the runtime's default
time zone»
([MDN resolvedOptions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions)).
Это именно идентификатор зоны, а не текущее смещение: смещение браузер сам
посчитает для конкретного момента.

### 5.2. Форматирование момента и подписи пояса

```js
const fmt = new Intl.DateTimeFormat(undefined, {
  timeZone: viewerZone,
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
fmt.format(new Date("2026-11-13T06:00:00Z")); // для Europe/Berlin: 07:00 GMT+1
```

- `timeZone` принимает IANA-имя или offset-идентификатор; по умолчанию —
  пояс рантайма
  ([MDN DateTimeFormat()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat)).
- `timeZoneName` бывает `"short"`, `"long"`, `"shortOffset"`, `"longOffset"`,
  `"shortGeneric"`, `"longGeneric"`; например `PST`, `GMT-8`,
  `Pacific Standard Time`. Это локализованная подпись, а не гарантированно
  «MSK».
- Если нужна подпись отдельно от времени (для бейджа «по вашему времени»),
  `formatToParts()` возвращает часть с `type: "timeZoneName"`
  ([MDN formatToParts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts)).
- `dateStyle`/`timeStyle` **нельзя** комбинировать с отдельными компонентами
  вроде `timeZoneName` — конструктор это запрещает. Либо `timeStyle: "long"`
  (он сам включает подпись пояса), либо `hour`/`minute` + `timeZoneName`.
- Форматировать надо **момент** (UTC-строку из API), а не naive-строку:
  `Intl` принимает `Date`, то есть уже конкретный момент.

### 5.3. Если зона не определилась

- По спецификации `resolvedOptions().timeZone` — строка; «не определилась» в
  виде `undefined` штатно не бывает: при отсутствии настройки подставляется
  пояс рантайма (MDN выше).
- Отличить «пользователь действительно в UTC» от «среда не знает зону и вернула
  `UTC`» по этому API нельзя. Если пояс критичен для UI, нужен ручной выбор
  зоны; список идентификаторов даёт `Intl.supportedValuesOf("timeZone")`
  (упомянут в
  [MDN Temporal.ZonedDateTime](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime)).
- Если в окружении нет `Intl` (очень старый браузер, нестандартный SSR/jsdom),
  нужен фолбэк: проверить наличие `Intl.DateTimeFormat` и показать время в
  поясе владельца с явной подписью.
- Невалидная строка в `timeZone` (например, из cookie/localStorage) бросает
  `RangeError` — конструктор надо оборачивать в `try/catch` и валидировать
  сохранённое значение
  ([MDN DateTimeFormat(), Exceptions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat#exceptions)).
- `Temporal` (`Temporal.ZonedDateTime`, `Temporal.Now.timeZoneId()`) — более
  правильная модель «момент + зона», но MDN помечает её как **Limited
  availability / not Baseline**: опираться на неё в проде пока нельзя
  ([MDN Temporal.ZonedDateTime](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime)).

## 6. Что именно ломается при наивном подходе

| Наивный приём | Что происходит | Источник |
| --- | --- | --- |
| Хранить `"2026-11-13 09:00"` без пояса | Нельзя отличить UTC от московского времени; naive-значение «не содержит достаточно информации, чтобы однозначно локализовать себя» | [datetime: aware/naive](https://docs.python.org/3.13/library/datetime.html#aware-and-naive-objects) |
| Писать в SQLite aware `09:00+03:00` «как есть» | Смещение отбрасывается, в БД лежит `09:00`, а не `06:00`; чтение — naive | локальный прогон, [sqlite.DATETIME](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#sqlalchemy.dialects.sqlite.DATETIME) |
| Брать `datetime.now(tz).utcoffset()` для всех слотов | Для зоны с DST смещение «сегодня» не равно смещению даты слота: в проверке для Берлина текущий +01:00 дал `08:00` вместо `07:00` UTC для июльского слота | [datetime.now()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.now), [PEP 495](https://peps.python.org/pep-0495/) |
| Генерировать «09:00 UTC + 24 ч» | При переходе DST местное время съезжает на час: 09:00 → 10:00 (проверено на Берлине) | локальный прогон, [datetime: supported operations](https://docs.python.org/3.13/library/datetime.html#datetime.datetime) |
| Сортировать строки с разными смещениями | Лексикографический порядок ≠ хронологический | [SQLite §4.1](https://www.sqlite.org/datatype3.html) |
| Сравнивать naive и aware | `==` → `False`, `<` → `TypeError` | [datetime: сравнение](https://docs.python.org/3.13/library/datetime.html#datetime.datetime) |
| Читать naive из БД и звать `.astimezone()` | Python подставит системный пояс сервера, а не UTC | [astimezone()](https://docs.python.org/3.13/library/datetime.html#datetime.datetime.astimezone) |
| Запустить `ZoneInfo("Europe/Moscow")` на Windows без `tzdata` | `ZoneInfoNotFoundError` на первом же запросе | [zoneinfo: data sources](https://docs.python.org/3.13/library/zoneinfo.html#data-sources), локальный прогон |
| Считать, что «Москва = +03:00 всегда» | Для будущих дат верно с 2014-10-26, но tzdb может измениться; для исторических дат неверно (2011–2014 — +04:00) | [tzdb `europe`](https://data.iana.org/time-zones/tzdb/europe) |

## 7. Проверено локально

Прогоны выполнялись из `backend/` через
`mise exec -- uv run [--with tzdata] python <script>` на Windows.

- `python 3.13.1`, `sqlalchemy 2.1.8`, `sqlite3.sqlite_version 3.45.3`.
- Без `tzdata`: `ZoneInfoNotFoundError: 'No time zone found with key
  Europe/Moscow'`.
- С `tzdata`:
  - `2026-11-13 09:00+03:00` → `2026-11-13T06:00:00+00:00`;
  - `2013-01-01 09:00+04:00` (постоянное летнее время 2011–2014);
  - Berlin fold: `2026-10-25 02:30` даёт `+02:00` при `fold=0` и `+01:00` при
    `fold=1`;
  - Berlin gap: `2026-03-29 02:30` даёт `+01:00` при `fold=0` и `+02:00` при
    `fold=1`;
  - SQLAlchemy: aware `09:00+03:00` → в БД `2026-11-13 09:00:00.000000`
    (`typeof=text`), чтение → `datetime(2026, 11, 13, 9, 0)` без `tzinfo`.

## 8. Источники

- Python 3.13, `zoneinfo` — <https://docs.python.org/3.13/library/zoneinfo.html>
  (использование `ZoneInfo`, `fold`, источники данных, Windows/`tzdata`).
- Python 3.13, `datetime` —
  <https://docs.python.org/3.13/library/datetime.html>
  (aware/naive, `now`, `utcoffset`, `astimezone`, `fold`, правила сравнения).
- PEP 495 «Local Time Disambiguation» — <https://peps.python.org/pep-0495/>
  (семантика `fold`, таблица складки/дыры, арифметика).
- IANA tzdb, файл `europe` — <https://data.iana.org/time-zones/tzdb/europe>
  (зона `Europe/Moscow`, правила `Russia`, переходы 2011 и 2014).
- SQLAlchemy 2.0, SQLite dialect, Date and Time Types —
  <https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#date-and-time-types>
  (хранение строкой, формат `DATETIME`, разбор `fromisoformat`).
- SQLAlchemy 2.0, `DateTime` —
  <https://docs.sqlalchemy.org/en/20/core/type_basics.html#sqlalchemy.types.DateTime>
  (смысл `timezone=True`, поддержка бэкендами).
- SQLite, Datatypes In SQLite — <https://www.sqlite.org/datatype3.html>
  (storage classes, affinity, сортировка и коллации).
- MDN, `Intl.DateTimeFormat` —
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat>
  (форматирование, `timeZoneName`, примеры).
- MDN, `Intl.DateTimeFormat()` —
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat>
  (опции `timeZone`/`timeZoneName`, `RangeError`).
- MDN, `resolvedOptions()` —
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions>
  (`timeZone` по умолчанию — пояс рантайма).
- MDN, `formatToParts()` —
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts>
  (часть `timeZoneName`).
- MDN, `Temporal.ZonedDateTime` —
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime>
  (модель «момент + зона», offset ambiguity, статус Baseline).
- `tzdata` на PyPI — <https://pypi.org/project/tzdata/>
  (пакет с базой IANA для систем без системной tzdb).
