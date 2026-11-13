# Shell: Windows и Linux

Агент запускается то в Windows PowerShell 5.1, то в Linux bash. Команды в
документации и задачи в `mise.toml` должны работать в обеих системах, иначе
указывайте ОС явно.

## Windows (PowerShell 5.1)

- Разделитель команд — `;`, а не `&&`.
- `head` / `tail` заменяются на `Select-Object -First N` / `-Last N`.
- Heredoc (`<<EOF`, `<<<`) не поддерживается. Запишите файл инструментом
  `write` и запустите его.
- После `git`, `npm`, `uv`, `mise` проверяйте `$LASTEXITCODE`.
- PowerShell показывает stderr native-команд как `NativeCommandError`.
  Успешный `mise run check` при перенаправлении вывода может выглядеть красным
  и отдавать `Exit code: 1`. Не судите по цвету: запускайте
  `mise run check:agent` или проверяйте `$LASTEXITCODE`.
- Инструменты из mise (`gh`, `uv`, `python`) могут отсутствовать в голом
  `PATH`. Запускайте `mise exec -- <tool>`. В текущем shell `gh` не был в
  `PATH`, хотя `mise exec -- gh --version` работает.

## Linux / macOS

- bash/zsh: `&&`, `head`, `tail` и heredoc допустимы.
- Внутри `mise run` и `mise exec` инструменты из `mise.toml` уже в `PATH`.

## Скрипты

- Автоматизацию, которая должна работать в обеих ОС, пишите на Python:
  `pathlib`, `subprocess.run([...])`, `encoding="utf-8"`.
- Не добавляйте `.ps1`- или `.sh`-only скрипт, если задача не специфична для ОС.
- Для проверок используйте `mise run check:agent` — он перехватывает вывод
  `mise run check` и возвращает настоящий код выхода.
