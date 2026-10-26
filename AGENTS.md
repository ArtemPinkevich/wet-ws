# Работа над wet-ws-ai

Начинай с [README](README.md), [дорожной карты](docs/product/roadmap.md) и Context Pack активной итерации. Они указывают действующие документы; все исторические материалы и все скиллы заранее читать не нужно. Для `docs` действуют эти инструкции; отдельного docs/AGENTS.md нет. Перед работой в `app` прочитай [инструкции приложения](app/AGENTS.md), а для `app/src` также [инструкции для кода](app/src/AGENTS.md), даже если сессия запущена из корня.

Если в корне существует .local-instructions.md, прочитай его до планирования действий и применяй как дополнение к этим инструкциям. При отсутствии этого файла общий workflow самодостаточен.

Цель проекта — создать WebSocket-продукт. Текущее направление и выбранный объём задаёт дорожная карта.

Это пэт-проект с нерегулярным временем работы. Не назначайте календарные сроки без прямого запроса автора; разбивайте работу на небольшие завершённые шаги.

Перед реализацией новой функции выясняйте, какую пользовательскую проблему она решает и на каких данных основано решение. Разделяйте подтверждённые наблюдения, выводы и предположения. Для внешних фактов сохраняйте ссылки и дату проверки. Не выдавайте интерес к продукту за готовность им пользоваться или платить.

Бизнес-анализ выполняет основной агент: сравнение аналогов, разбор опыта автора и критическая проверка гипотез без исследовательских субагентов.

Отдельный исполнитель — [Independent Reviewer](.codex/agents/independent-reviewer.toml). Условия вызова задаёт [iteration-orchestrator](.agents/skills/iteration-orchestrator/SKILL.md#autonomous-agents); основной агент выбирает технические skills по конкретному пробелу, а OpenDesign использует при UI/UX impact по маршрутизации. Каждый запуск ограничен заданием, источниками и владением файлами; создание определения не запускает постоянную работу.

Задания ролям должны учитывать текущий этап и ограничения Context Pack активной итерации и [дорожной карты](docs/product/roadmap.md). Пока нет возможности проводить интервью и внешние пользовательские тесты; анализ ИИ не заменяет их.

При переходе этапа основной агент проверяет достаточность skills и необходимость автономного исполнителя по конкретной задаче. Не восстанавливай цепочку технических ролей и исследовательских агентов бизнес-анализа; новые агенты требуют отдельного основания.

Independent Reviewer проверяет итог перед Done. Canonical триггеры находятся в iteration-orchestrator; работа после закрытия приложения не предполагается.

Фиксируйте существенные исходные данные, проверки, решения и неизвестное в Context Pack или соответствующей canonical документации.

Для воспроизводимой разработки сохраняйте постановки задач, способы проверки и озвученные основания решений. Не выдумывайте отзывы, результаты или метрики.

Корень wet-ws-ai — рабочая область и Git-корень по решению автора. app содержит приложение: код в app/src, рядом тесты и настройки сборки; отдельного app/.git нет. Git-команды выполняй из корня, npm и Docker-сборку — из app. docs хранит документацию разработки; определения ролей — .codex/agents. Документы остаются рядом с app, не копируй их внутрь приложения. .agents/skills и .codex/agents также остаются в корне. Проектные skills, определения публичных ролей и AGENTS.md публикуются вместе с исходниками; исключения локальных файлов задаёт корневой .gitignore. В app есть собственные README и AGENTS.md, сборка не зависит от соседних документов.

Внутри `docs`: `product` — потребности, истории и направление продукта; `engineering/architecture/overview.md` — каноническая текущая архитектура. В `engineering/iterations/iteration-NN/context-pack.md` хранятся рабочий контекст, поведение, критерии, решения и gates итерации. Процесс: user stories → Context Pack → gates → при необходимости точечные артефакты → временный handoff только при фактической передаче → implementation → verification. Отдельный `требования.md`, полная архитектура и UI/UX-документ не обязательны. Полные архитектуры по итерациям не создаются и не сохраняются ради истории; архитектурная дельта сначала фиксируется в Context Pack, принятое и реализованное изменение — в затронутой части canonical overview. Дополнительные файлы создаются только при самостоятельной ценности. Назначение и связи документов — в README и локальном AGENTS.md. Новая итерация начинает с одного Context Pack; пустые каталоги будущих итераций заранее не создаём.


## Iteration workflow

- When starting or resuming a product iteration, use `$iteration-orchestrator`.
- Do not begin implementation until the orchestrator reaches `Implementation Ready Gate: PASS`.
- Prefer `SKIP` when a gate requires no work.
- Route by impact at iteration start: no UI/UX change skips UI design; UI/UX change starts interactive design early in OpenDesign. Applicable technical checks may run alongside it; gate names do not impose a linear sequence. Routing and project-specific tool boundaries belong to iteration-orchestrator.
- Significant UI/UX changes require owner agreement on an identified interactive prototype and technical readiness before Implementation Ready PASS. Prototype code stays separate from production app code.
- Autonomous agents follow the triggers in iteration-orchestrator; parallel tracks do not require a role pipeline.
- Escalate only narrow, materially difficult decisions to Astra.
- Do not use Astra for routine repository exploration or implementation.

OpenDesign — единственный основной инструмент визуального проектирования и интерактивного согласования WET-WS по [правилам orchestrator](.agents/skills/iteration-orchestrator/SKILL.md#design-tools). Impeccable в процессе WET-WS не используется; его глобальная установка для других проектов сохраняется. Canonical свидетельства текущего реализованного UI остаются в docs/engineering/ui/mockups/; предложения не подменяют реализацию. Хранение ревизий/экспортов, обновление canonical и сохранность истории определяет [UI lifecycle orchestrator](.agents/skills/iteration-orchestrator/SKILL.md#ui-mockup-completion).

## Canonical code-quality gate

Во время разработки допустимы исправляющие команды и узкие проверки. Перед завершением любого change set обязателен успешный полный `npm run check` из app; узкие проверки его не заменяют. Не объявляй работу завершённой при непройденном check. Долговременная policy и команды — в [README приложения](app/README.md#качество-кода); момент проверки — в существующем iteration workflow.
