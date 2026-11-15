
<div id="controlPanelApplication">

<style type="text/css">
    .extensionView * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
</style>

<script type="text/x-handlebars" data-template-name="desktop">
    <div class="containerAll">
        <div class="statusbar">
{literal}
            <!-- Connection state + extension counters (styles: .cp-* in style.css) -->
            {{#if connected}}
                <span class="cp-conn cp-conn-on"><span class="cp-dot"></span>{/literal}{$LBL_CONNECTED}{literal}</span>
            {{else}}
                <span class="cp-conn cp-conn-off"><span class="cp-dot"></span>{/literal}{$LBL_CONNECTING}{literal}</span>
            {{/if}}
            <div class="cp-stat cp-stat-online">
                <span class="cp-stat-value Count-Registered">{{registeredCount}}</span>
                <span class="cp-stat-label">{/literal}{$LBL_EXT_ONLINE}{literal}</span>
            </div>
            <div class="cp-stat cp-stat-offline">
                <span class="cp-stat-value Count-NotRegistered">{{unregisteredCount}}</span>
                <span class="cp-stat-label">{/literal}{$LBL_EXT_OFFLINE}{literal}</span>
            </div>
            <!-- Sound alarm for long waits; state kept by javascript.js (updateSoundButton) -->
            <span id="cp-sound-toggle" class="cp-sound" onclick="toggleWaitSound()"><i class="fa fa-bell-slash"></i> {/literal}{$LBL_SOUND}{literal}</span>
            <!-- Desktop notification for long waits (HTTPS only; hidden by updateNotifyButton when unsupported) -->
            <span id="cp-notify-toggle" class="cp-sound" style="display:none" onclick="toggleDesktopNotify()"><i class="fa fa-desktop"></i> {/literal}{$LBL_NOTIFY}{literal}</span>
            <!-- TV mode (wallboard): queues only, large, full screen; see toggleWallboard() -->
            <span id="cp-wallboard-toggle" class="cp-sound" onclick="toggleWallboard()" title="{/literal}{$LBL_WALLBOARD_TITLE}{literal}"><i class="fa fa-television"></i> {/literal}{$LBL_WALLBOARD}{literal}</span>
            <!-- Module language for this browser (cp_lang cookie, see _applyModuleLanguage in index.php) -->
            <span class="cp-langs" title="{/literal}{$LBL_LANGUAGE}{literal}"><i class="fa fa-globe"></i>{/literal}{$CP_LANG_SWITCH}{literal}</span>
{/literal}
        </div>
<div class="left-container" id="left-container">
        {literal}{{#view App.BaseSortableView }}{/literal}
        {* La lista de las extensiones no asignadas a alguna de las áreas *}
        {literal}
            {{#view App.PBXPanelView controllerBinding="extensions" }}
              <dt class="operator-title-container" id="operator-title-container">
               <i class="fa fa-phone" style="font-size:20px; padding-right:5px;"></i> {/literal}{$AREA_DESCR_EXTENSION}{literal} 

              </dt>
                 <div class="Extensions-List" id="Extensions-List">
                    {{#if finishedloading}}
                        {{#view App.SortablePanelView }}
                            {{#each }}
                                  {{view App.ExtensionView}}
                            {{else}}
                                <br/>
                            {{/each}}
                        {{/view}}
                    {{else}}
                <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                {{/if}}
                </div>
            {{/view}}
        {/literal}
        {literal}{{/view}}{/literal}{* App.BaseSortableView *}
                {literal}{{#view App.FAQView }}{/literal}
        {literal}{{#view App.BaseSortableView }}{/literal}
        {* La lista de las extensiones asignadas al área 1 *}
          {*  {literal}
                {{#view App.PBXPanelView controllerBinding="area1" }}
                    {{view App.EditableTitleView }}
                    <dd>
                    <div class="Extensions-List" id="Extensions-List">
                        {{#if finishedloading}}
                            {{#view App.SortablePanelView }}
                                {{#each }}
                                    {{view App.ExtensionView}}
                                {{else}}
                                    <br/>
                                {{/each}}
                                {{/view}}
                            {{else}}
                            <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                        {{/if}}
                    </div>
                    </dd>
                {{/view}}
            {/literal}</br> *}
        {* La lista de las extensiones asignadas al área 2 *}
             {*   {literal}
                {{#view App.PBXPanelView controllerBinding="area2" }}
                    {{view App.EditableTitleView }}
                    <dd>
                    <div class="Extensions-List" id="Extensions-List">
                        {{#if finishedloading}}
                            {{#view App.SortablePanelView }}
                                {{#each }}
                                    {{view App.ExtensionView}}
                                {{else}}
                                    <br/>
                                {{/each}}
                                {{/view}}
                            {{else}}
                            <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                        {{/if}}
                    </div>
                    </dd>
                {{/view}}
            {/literal}</br>  *}

        {literal}{{/view }}{/literal} {* App.BaseSortableView *}
        {literal}{{/view}}{/literal} {* App.FAQView *}
       
        </div>
       
        <div class="right-container">
        {literal}{{#view App.FAQView }}{/literal}
        {literal}{{#view App.BaseSortableView }}{/literal}
       
        {* La lista de las colas *}
            {literal}
                {{#view App.PBXPanelView controllerBinding="queues" }}
                    <dt class="operator-title-container"><i class="fa fa-users"></i>&nbsp;{{description}}</dt>
                    <dd>
                        {{#if finishedloading}}
                            <div class="q-list">
                                {{#each }}
                                    {{view App.QueueView}}
                                {{else}}
                                    <br/>
                                {{/each}}
                            </div>
                    {{else}}
                        <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                    {{/if}}
                    </dd>
                {{/view}}
            {/literal}
        {* Conferences and call parking panels were removed: not used. The
           backend skips them too (paloControlPanelStatus::$_withConferencesAndParking). *}
         {literal}{{/view }}{/literal} {* App.BaseSortableView *}
         {literal}{{/view}}{/literal} {* App.FAQView *}
         </div>
           
        <div class="left-container">
        {literal}{{#view App.BaseSortableView }}{/literal}
        {* La lista de las troncales VoIP *}
        <div style="width:100%; float:left">
        {literal}
            {{#view App.PBXPanelView controllerBinding="iptrunks" }}
                <dt class="operator-title-container" id="operator-title-container";">
                    {/literal}{$AREA_DESCR_TRUNKSSIP}{literal}
                </dt>
                {{#if finishedloading}}
                    <div>
                        {{#each }}
                            {{view App.IPTrunkView }}
                        {{else}}
                            <br/>
                        {{/each}}
                    </div>
                {{else}}
                    <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                {{/if}}
            {{/view}}
        {/literal}
        </div>
        {* La lista de las troncales DAHDI *}
        <div style="width:50%; float:left; display: none;">
        {literal}
            {{#view App.PBXPanelView controllerBinding="dahdi" }}
            <dt class="operator-title-container" id="operator-title-container";">
                {/literal}{$AREA_DESCR_TRUNKS}{literal}
              </dt>
                    {{#if finishedloading}}
                        <div>
                            {{#each }}
                                {{view App.DAHDISpanView }}
                            {{else}}
                                <br/>
                            {{/each}}
                        </div>
                    {{else}}
                <img class "icon" src="modules/{/literal}{$module_name}{literal}/images/loading.gif"/>
                {{/if}}
            {{/view}}
        {/literal}
        </div>
        {literal}{{/view}}{/literal}{* App.BaseSortableView *}
        </div>
       
    </div>
</script><!-- data-template-name="desktop" -->


  {* Extension card *}
<script type="text/x-handlebars" data-template-name="extension">
<div style="float:left; border: black solid 0px; z-index:2;">
<a class="pbxtooltip" href="#">
     <img src="modules/{$module_name}/images/info.png"style="width:20px; height:20px; opacity:0.8;"/>
     <div>
     {literal}
     {{channel}} {{#if registered}} - ({{ip}}){{/if}}<br/>
            {{description}}<br/>
     {{#if active }}
     <ul>
         {{#each active}}
         <li>{{formatSince}}: {{remoteExten}}</li>
         {{/each}}
         </ul>
         {{/if}}
     {/literal}
     </div>
</a>
</div>
<div class="ext-body">
{literal}
<div class="ext-title">
    <b>{{extension}}</b>
    {{#if view.truncatedDescription}}
        <span class="ext-name">{{view.truncatedDescription}}</span>
    {{/if}}
</div>
{{! One row per active call: talk time and the other party. The "monitor"
    class and the title (channel) are read by the click handler. }}
<div class="ext-calls RemoteExtension">
    {{#each active}}
        <div class="monitor ext-call" title="{{Channel}}"><i class="fa fa-phone"></i> {{formatSince}} &middot; {{remoteExten}}</div>
    {{/each}}
</div>
{/literal}
</div>
{literal}
<div class="phone-mail-container" style="float:right; margin-left:8px; overflow:hidden;">
  <div class="phone-icon" style="float:left;">
    {{view App.DraggablePhoneIconView iconBinding="view.extensionIcon"}}
  </div>
  {{#if unreadMail }}
  <div class="mail-icon" style="float:left; margin-left:4px;">
    <a class="pbxtooltip">
      <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/mail.png" style="width:23px; height:16px;" />
      <div>{/literal}{$LBL_NEW}{literal}: {{NewMessages}}, {/literal}{$LBL_OLD}{literal}: {{OldMessages}}</div>
    </a>
  </div>
  {{/if}}
</div>
{/literal}
{literal}<div style="clear:both;"></div>{/literal}
</script>


<script type="text/x-handlebars" data-template-name="iptrunk">
<div style="float:left; border: black solid 0px;">
    <a class="pbxtooltip" href="#">
    <img src="modules/{$module_name}/images/info.png"/>
    <div>
        {literal}
        {{channel}} {{#if registered}}({{ip}}){{/if}}<br/>
        {{#if active}}
        <ul>
    {{#each active}}
    <li>{{formatSince}}: {{CallerIDNum}}</li>
    {{/each}}
    </ul>
    {{/if}}
        {/literal}
    </div>
    </a>
</div>
<div style="float:left; width:115px; text-align:left; padding-left:4px;">
    {literal}
    <b>{{view.truncatedDescription}}</b><br/>
    {{#each active}}
    <span class="monitor">{{formatSince}}: {{CallerIDNum}}</span><br/>
    {{/each}}
    {/literal}
</div>
{literal}
<div style="float: right; border: black solid 0px;">
    <img class="icon" src="modules/{/literal}{$module_name}{literal}/images/icon_trunk2.png"/>
</div>
{/literal}
</script>
<script type="text/x-handlebars" data-template-name="dahdispan">
<div style="float:left; border: black solid 0px;">
    <a class="pbxtooltip" href="#">
    <img src="modules/{$module_name}/images/info.png"/>
    <div>
        {literal}
        DAHDI/{{span}}: {{formatChanRange}}<br/>
        <!-- Mostrar los números de los canales en la alarma -->
        {{#each chan}}<span {{bindAttr style="alarmstyle"}}>{{chan}}</span>{{/each}}
       
        <!-- Mostrar las llamadas activas no clasificadas en un canal canal -->
        {{#if active}}
        <ul>
        {{#each active}}
        <li>{{formatSince}}: {{CallerIDNum}}</li>
        {{/each}}
        </ul>
        {{/if}}
        <!-- Mostrar las llamadas activas en cada canal -->
        <ul>
        {{#each chan}}
            {{#if active }}
            <li>{{chan}}:
            {{#each active}}
                {{formatSince}}: {{CallerIDNum}}
            {{else}}
                ({/literal}{$LBL_IDLE}{literal})
            {{/each}}
            </li>
            {{/if}}
        {{/each}}
        </ul>
        {/literal}
    </div>
    </a>
</div>
<div style="float:left; width:135px; text-align:left; padding-left:4px;">
    {literal}
    <b>DAHDI/{{span}}:</b> {{formatChanRange}}<br/>
    {/literal}
</div>
<div style="float: right; border: black solid 0px;">
    <img class="icon" src="modules/{$module_name}/images/icon_trunk2.png"/>
</div>
</script>

{* Queue card (styles: .q-* in style.css). Counters are bindings to
   App.QueueView properties. The agent list is filled by
   actualizarUI()/refreshAgents() in javascript.js, so .Queue-Agents must stay
   free of Handlebars bindings. *}
<script type="text/x-handlebars" data-template-name="queue">
{literal}
<div class="q-head">
    <span class="q-title">{/literal}{$LBL_QUEUE}{literal} <b>{{extension}}</b></span>
    {{#if view.truncatedDescription}}<span class="q-name">{{view.truncatedDescription}}</span>{{/if}}
    <i class="fa fa-refresh q-reset" title="{/literal}{$LBL_RESET_STATS}{literal}" onclick="refreshQueueParameters(this)"></i>
</div>
<div class="q-stats">
    <div class="q-stat q-stat-answered">
        <span class="q-stat-value">{{view.answered}}</span>
        <span class="q-stat-label">{/literal}{$LBL_ANSWERED}{literal}</span>
    </div>
    <div class="q-stat q-stat-abandoned">
        <span class="q-stat-value">{{view.abandoned}}</span>
        <span class="q-stat-label">{/literal}{$LBL_ABANDONED}{literal}</span>
    </div>
    <div class="q-stat q-stat-waiting">
        <span class="q-stat-value">{{callers.length}}</span>
        <span class="q-stat-label">{/literal}{$LBL_WAITING}{literal}</span>
    </div>
    <div {{bindAttr class=":q-stat :q-stat-longest view.longestWaitClass"}}>
        <span class="q-stat-value">{{view.longestWait}}</span>
        <span class="q-stat-label">{/literal}{$LBL_LONGEST_WAIT}{literal}</span>
    </div>
    <div {{bindAttr class=":q-stat :q-stat-kpi view.slaClass"}} title="{/literal}{$LBL_SLA_TITLE}{literal}">
        <span class="q-stat-value">{{view.slaText}}</span>
        <span class="q-stat-label">{{view.slaLabel}}</span>
    </div>
    <div {{bindAttr class=":q-stat :q-stat-kpi view.abandonRateClass"}}>
        <span class="q-stat-value">{{view.abandonRateText}}</span>
        <span class="q-stat-label">{/literal}{$LBL_ABANDON_RATE}{literal}</span>
    </div>
    <div class="q-stat q-stat-kpi" title="{/literal}{$LBL_AVG_TITLE}{literal}">
        <span class="q-stat-value">{{view.avgWait}}</span>
        <span class="q-stat-label">{/literal}{$LBL_AVG_WAIT}{literal}</span>
    </div>
    <div class="q-stat q-stat-kpi" title="{/literal}{$LBL_AVG_TITLE}{literal}">
        <span class="q-stat-value">{{view.avgTalk}}</span>
        <span class="q-stat-label">{/literal}{$LBL_AVG_TALK}{literal}</span>
    </div>
</div>
<div class="q-body">
    <div class="q-col q-col-agents">
        <div class="q-col-title">{/literal}{$LBL_AGENTS}{literal}
            <span class="q-sort" onclick="toggleAgentSort()"><i class="fa fa-sort-amount-asc"></i></span></div>
        <div class="Queue-Agents q-agents-list"></div>
    </div>
    <div class="q-col q-col-callers">
        <div class="q-col-title">{/literal}{$LBL_CUSTOMERS_IN_QUEUE}{literal}</div>
        {{#each callers}}
            {{view App.QueueCallerView}}
        {{else}}
            <div class="q-empty">{/literal}{$LBL_QUEUE_NO_CALLERS}{literal}</div>
        {{/each}}
    </div>
</div>
{/literal}
</script>
<script type="text/x-handlebars" data-template-name="queue-caller">
{literal}<i class="fa fa-user"></i> <span class="q-caller-num">{{CallerIDNum}}</span> <span class="q-caller-wait">{{view.formatWait}}</span>{/literal}
</script>
<script type="text/x-handlebars" data-template-name="editable-title">
{literal}
{{#if editing }}
{{view Ember.TextField valueBinding="description" }}
<button {{action "save" bubbles=false }}>{/literal}{$LBL_SAVE_NAME}{literal}</button>
{{else}}
{{description}} -- {{length}} {/literal}{$LBL_EXT_SHORT}{literal}
<span class="paneledittitle" {{action "edit" bubbles=false }}>[{/literal}{$LBL_EDIT_NAME}{literal}]</span>
{{/if}}
{/literal}
</script>
</div>

<script type="text/javascript">
var arrLang_main = {$ARRLANG_MAIN};
var var_init = {$VAR_INIT}
</script>

