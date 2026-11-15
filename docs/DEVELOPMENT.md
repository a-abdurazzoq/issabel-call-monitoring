# Development guide

How the Call Monitoring module is put together, for people who want to change
it. For installation and usage see the [README](../README.md).

The module started as Issabel's Operator Panel by PaloSanto. Many comments and
identifiers are therefore in Spanish (`estadoCliente`, `manejarRespuestaSnapshot`,
`procesarPaquetes`). There is no build step. The PHP code runs inside the
Issabel framework and can't be run on its own.

## Repository layout

```text
install.sh                  installer / updater (run on the PBX as root)
control.xml                 menu definition, merged by issabel-menumerge
asterisk/extensions_cp_spy.conf   dialplan: "press 1" before listening on an external number
control_panel/              the module, copied to /var/www/html/modules/control_panel/
  index.php                 entry point: page rendering and JSON actions
  configs/default.conf.php  module settings (SQLite layout database)
  libs/
    paloControlPanelStatus.class.php   collects the PBX state (FreePBX DB, SQLite, AMI)
    paloControlPanelUtils.class.php    actions: layout changes, queue reset, call listening
    AGI_AsteriskManager2.class.php     AMI client with deadlines and batching
    paloInterfaceSSE.class.php,
    paloServerSentEvents.class.php     legacy streaming endpoint (see below)
  themes/default/
    panel.tpl               Smarty template with the Handlebars templates inside
    js/javascript.js        Ember application and all page logic
    css/style.css           styles
  lang/en, ru, uz .lang     UI strings (en.lang holds every key)
  help/en, ru, uz .hlp      built-in help (the "?" button in Issabel)
  langmenu/ru, uz .lang     menu item name in the Issabel sidebar
  images/                   icons used by the page
docs/                       documentation and screenshots
```

## Request flow

**Routing (`index.php`).** Issabel calls `_moduleContent()`.

- Without an `action` parameter, `handleHTML_mainReport` renders
  `themes/default/panel.tpl`.
- `?action=X` is handled by the function `handleJSON_X`. Unknown actions go to
  `handleJSON_unimplemented`. To add an endpoint, add a `handleJSON_<name>`
  function.
- On every request `checkAreas()` makes sure the SQLite table `area` has the
  rows `Area1` to `Area9`.

**Snapshot polling.** The browser asks for the whole PBX state about once a
second:
`index.php?menu=control_panel&rawmode=yes&action=pbxSnapshot`.

1. `handleJSON_pbxSnapshot` creates `paloControlPanelStatus(TRUE)` and calls
   `snapshot()`.
2. Static objects come from the FreePBX MySQL database: devices, queues,
   trunks.
3. Panel assignments come from SQLite: `/var/www/db/control_panel_design.db`.
4. The live state comes from AMI. AMI responses are handled by methods named
   `msg_<EventName>`, which the constructor registers by reflection.
5. In snapshot mode only a whitelist of list events is registered, and the AMI
   login uses `events=off`. If a snapshot needs another AMI list event, add it
   to that whitelist.
6. All AMI work has a 5-second deadline (`AGI_AsteriskManager2::setDeadline`).
7. The response is `{pbxchanges: [...], snapshot: true, timestamp}`.

**Browser side.** `App.DesktopController.pbxStatus()` keeps at most one
request in flight. After an error it retries in 3 s, and the request timeout
is 7 s. `manejarRespuestaSnapshot` compares each object with the previous
snapshot, applies only the changes to the Ember objects and removes objects
that disappeared. Call and wait timers run in the browser between snapshots.

**Legacy stream.** `handleJSON_pbxStatus` is the old Server-Sent Events
endpoint (`paloServerSentEvents`, `paloInterfaceSSE` and the event handlers
`msg_*` that compute deltas). The current page does not use it. It is kept for
pages still running old JavaScript from the browser cache.

## Frontend

- Ember 1.5.1, Handlebars 1.3 and jQuery 1.8.3. The Handlebars templates live in
  `panel.tpl` as `<script type="text/x-handlebars">` blocks.
- `modificarReferenciasLibreriasJS()` in `index.php` puts Handlebars before
  Ember and replaces the framework's jQuery when it is older.
- Ember 1.x syntax: `bindAttr` (not `bind-attr`) and computed properties with
  `.property(...)`.

**Queue card.** `App.QueueView` renders the card with the `queue` template:

- The KPI tiles are computed properties over the queue fields from AMI
  `QueueParams`: `Completed`, `Abandoned`, `Holdtime`, `TalkTime`,
  `ServiceLevel`, `ServiceLevelPerf`. The color thresholds are in those
  properties.
- The agent list (`.Queue-Agents`) is plain DOM filled by `refreshAgents()` and
  `agentRowHTML()`. Don't put Handlebars bindings inside it.
- Agent timers:
  - In a call or ringing: the start of the oldest active channel of the agent's
    phone (`phoneCallSince`, built from `phones[].active[].Since`).
  - Otherwise, on first sight: `LastPause` or `LastCall` from AMI
    `QueueMember`.
  - Otherwise the timer starts at the next state change.
- `finishAgentList()` refreshes timers and sorting after every update.

**Alarms.** `checkWaitAlarms()` runs every second. It updates the "(N)"
counter in the tab title and the agent timers, and fires the beep and the
desktop notification once per waiting caller. The thresholds are the
`*_SEC` constants in `javascript.js`. Per-browser choices are kept in
`localStorage`:

| Key | Holds |
| --- | --- |
| `cp-wait-sound` | Sound on or off |
| `cp-notify` | Desktop notifications on or off |
| `cp-agent-sort` | Sort agents by state or by number |
| `cp-spy-recent` | Recent listening numbers |

**Pausing an agent.** The last element of an agent row (`agentRowHTML`) is
`.agent-pause` with the member interface in `data-iface` (from
`QueueMember.Interface`/`Location`). `toggleAgentPause()` asks for a
confirmation and posts `action=queuePause` (`interface`, `paused` 1/0).
`paloControlPanelUtils::queuePause` sends AMI `QueuePause` **without**
`Queue`, so the agent is paused in all of its queues, with the reason
`_tr('Supervisor')`. Rows that can't be paused get an invisible
`.agent-pause.is-none`, which keeps the status text of all rows in one column.

**TV mode (wallboard).** `toggleWallboard()` adds the class `cp-wallboard` to
`<html>`; everything else is CSS (`html.cp-wallboard ...` in `style.css`): the
module root is put `position: fixed` over the whole Issabel page, the
extension and trunk panels, the status bar (except the connection state) and
all buttons are hidden, and the queue card gets large fonts. The URL gets
`wallboard=1` (`history.replaceState`), so the mode survives a reload and a TV
can open such a link directly. Full screen is requested only from the
button, because browsers allow it only after a click; leaving full screen
(Esc) also leaves the mode. The clock and the exit button are a separate
`#cp-wb-bar` outside the Ember templates.

**Conferences and call parking** were removed from the page. The backend skips
them too: `$_withConferencesAndParking = FALSE` in `paloControlPanelStatus`.
The JavaScript controllers `conferences` and `parkinglots` still exist and stay
empty.

## Call listening (ChanSpy)

The browser side starts in `openSpyDialog()`. The server side is made of
`handleJSON_spyStart`, `spyStatus`, `spyMode` and `spyStop` in `index.php`,
backed by `paloControlPanelUtils::spy*`.

- **Start.** `spyStart` sends an AMI `Originate` with `Application: ChanSpy`
  and `Data: <agent dial string>-,qdE[w|B]`. This matches FreePBX's
  `targeted-chanspy` context.
  - `q`: no beep.
  - `d`: phone keys 4/5/6 switch the mode.
  - `E`: listening ends with the agent's call.
  - `w` / `B`: whisper / barge.
- **Who gets called:**
  - An own extension is dialled directly through `DEVICE/<n>/dial`, so it never
    reaches follow-me or voicemail.
  - Other numbers go through `Local/<n>@from-internal` with a 20-second
    timeout. They don't get ChanSpy directly: the call goes to the dialplan
    context `cp-spy-confirm` (`asterisk/extensions_cp_spy.conf`, installed by
    `install.sh` to `/etc/asterisk/` and included from
    `extensions_custom.conf`). It plays a beep and waits for 1 (three tries,
    5 s each), so voicemail or an answering machine never gets the
    conversation. The agent device and the mode letters come in one channel
    variable `CP_SPY=<dial string>^<w|B|empty>` (the AMI client can't send
    several `Variable` headers) and are split with `CUT`.
  - Before calling an external number, `spyStart` checks with
    `dialplan show s@cp-spy-confirm` that the context is loaded. Without it the
    number is refused, it is never called unconfirmed.
- **Status.** `spyStatus` returns `active`, `answered` and `confirming`
  (answered, still in `cp-spy-confirm`, ChanSpy not started). While
  confirming or ringing the page disables the mode buttons and `spyMode`
  refuses, because a 4/5/6 key would go to the "press 1" prompt.
- **Session.** The originated channel gets a known uniqueid (`ChannelId`,
  `cpspy-<time>-<rand>`), which is stored in `$_SESSION[$module]['spy']`.
  Status, mode and hangup requests only accept session ids of the same
  Issabel session.
- **Mode switching.** It "presses" 4/5/6 on the supervisor's channel with
  `PlayDTMF` + `Receive`. When Asterisk has no `Receive` option, the request
  answers `unsupported` and the page calls the supervisor again in the new
  mode.

## Strings and languages

- The module speaks English, Russian and Uzbek (Latin script, with `ʻ` U+02BB
  in `oʻ`/`gʻ` and `ʼ` U+02BC as the apostrophe).
- `lang/en.lang` holds **every** key. Issabel loads it first and merges the
  file of the system language over it. Add every new string to all the lang
  files (`en`, `ru`, `uz`).
- Issabel's language is a system-wide setting, and its list of languages has no
  Uzbek. So the module has its own switcher (EN / RU / UZ in the status bar):
  - `setModuleLanguage()` in JavaScript stores the choice in the `cp_lang`
    cookie and reloads the page.
  - `_applyModuleLanguage()` in `index.php` runs after
    `load_language_module()`. If the cookie is set, it loads `en.lang` again,
    merges the chosen file over it and replaces the module strings.
  - Without the cookie, `_currentModuleLanguage()` uses Issabel's language if
    the module has it, otherwise English.
- No UI text directly in `panel.tpl` or JavaScript:
  - Template strings are Smarty variables `LBL_*`.
  - JavaScript strings come from `arrLang_main` (`ARRLANG_MAIN` in `index.php`)
    through `tr(key, fallback)`.
  - Both are built with `_tr()` in `handleHTML_mainReport`.
  - Inside `{literal}` blocks write `{/literal}{$LBL_X}{literal}`.
- Keys must be unique within a lang file. A duplicate key silently overrides the
  earlier one.
- Panel titles are stored in SQLite (`area.description`) and translated with
  `_tr()`. The keys `Area 1`…`Area 9`, `Extensions`, `Queues` and so on are in
  the lang files.
- To add a language:
  1. Copy `en.lang` to `lang/<code>.lang` and translate the values.
  2. Add `help/<code>.hlp`.
  3. Add the code to `_moduleLanguages()` in `index.php` so that it appears in
     the switcher.
  4. Add a `README.<code>.md` and the screenshots in `docs/images/<code>/`, and
     a link to it in the language bar at the top of every README.

The help window is served by Issabel itself (`help/frameRight.php`), which picks
`help/<lang>.hlp` by the Issabel system language, not by the module switcher.
Issabel's language list has no Uzbek, so `help/uz.hlp` is shown only if `uz` is
added to that list and selected in Issabel; otherwise the help is in the
Issabel language or in English.

The menu item in the Issabel sidebar is translated separately. Before it builds
the menu, Issabel includes `modules/<module>/langmenu/<lang>.lang` of every
module for the system language and translates the `desc` from `control.xml`
with its `$arrLangMenu`. English needs no file, `desc` is already English. The
module switcher does not change the menu: it follows the Issabel language like
the rest of the sidebar.

## Conventions

- The code must run on the PHP version shipped with Issabel 5. Use what the
  framework provides: `Services_JSON` for JSON, `paloDB` for databases, `_tr()`
  for translations.
- **Never add PHP files that are called directly.** Only `index.php` goes
  through Issabel authentication. Add actions as `handleJSON_*` functions.
- Actions that change something are listed in `_writeActions()` in
  `index.php`. Before dispatching such an action, `_moduleContent()` requires
  a POST request whose `Origin` (or `Referer`) header is the PBX's own host
  (`_isSameOriginPost()`). This protects against cross-site request forgery:
  a link or form on another site can't use the logged-in user's session. Add
  every new state-changing action to that list and call it with `$.post`.
- Validate every value before it reaches an AMI command (see the regular
  expressions in `paloControlPanelUtils`).
- The code contains commented-out blocks marked `//VOIPIRAN` (for example ACL
  filtering through `pymecall_panel_acl`). They are kept from upstream for
  reference.

## Checking changes

There is no automated test suite.

- Syntax check of the JavaScript:

  ```sh
  node -e "new Function(require('fs').readFileSync('control_panel/themes/default/js/javascript.js','utf8'))"
  ```

- PHP: `php -l <file>` on the PBX or any machine with PHP.
- In the browser: install on a test PBX and watch the `pbxSnapshot` requests in
  the developer tools. Make a test call into a queue and check the extension
  card and the agent row. Then switch the Issabel language and check that the
  labels change.
