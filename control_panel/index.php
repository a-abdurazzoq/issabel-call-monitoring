<?php

/*
  vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4:
  Codificación: UTF-8
  +----------------------------------------------------------------------+
  | Issabel version 1.6-3                                               |
  | http://www.issabel.org                                               |
  +----------------------------------------------------------------------+
  | Copyright (c) 2006 Palosanto Solutions S. A.                         |
  +----------------------------------------------------------------------+
  | The contents of this file are subject to the General Public License  |
  | (GPL) Version 2 (the "License"); you may not use this file except in |
  | compliance with the License. You may obtain a copy of the License at |
  | http://www.opensource.org/licenses/gpl-license.php                   |
  |                                                                      |
  | Software distributed under the License is distributed on an "AS IS"  |
  | basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See  |
  | the License for the specific language governing rights and           |
  | limitations under the License.                                       |
  +----------------------------------------------------------------------+
  | The Initial Developer of the Original Code is PaloSanto Solutions    |
  +----------------------------------------------------------------------+
  $Id: index.php,v 1.1 2007/01/09 23:49:36 alex Exp $
*/

require_once "libs/paloSantoJSON.class.php";

function _moduleContent(&$smarty, $module_name)
{
    require_once "modules/$module_name/configs/default.conf.php";
    require_once "modules/$module_name/libs/paloInterfaceSSE.class.php";
    require_once "modules/$module_name/libs/paloServerSentEvents.class.php";
    require_once "modules/$module_name/libs/paloControlPanelUtils.class.php";


    load_language_module($module_name);
    _applyModuleLanguage($module_name);

    global $arrConf;
    global $arrConfModule;
    $arrConf = array_merge($arrConf,$arrConfModule);



    //folder path for custom templates
    $base_dir = dirname($_SERVER['SCRIPT_FILENAME']);
    $templates_dir = (isset($arrConf['templates_dir']))?$arrConf['templates_dir']:'themes';
    $local_templates_dir = "$base_dir/modules/$module_name/".$templates_dir.'/'.$arrConf['theme'];

    checkAreas();

    // Valores estáticos comunes a todas las operaciones
    $smarty->assign('module_name', $module_name);

    $h = 'handleHTML_mainReport';
    if (isset($_REQUEST['action'])) {
        $h = NULL;

        // Actions that change something must come from this module's page
        if (in_array($_REQUEST['action'], _writeActions(), TRUE) && !_isSameOriginPost()) {
            $json = new Services_JSON();
            Header('Content-Type: application/json');
            return $json->encode(array(
                'status'    =>  'error',
                'message'   =>  _tr('Request rejected: it must be sent from the Call Monitoring page'),
            ));
        }

        if (is_null($h) && function_exists('handleJSON_'.$_REQUEST['action']))
            $h = 'handleJSON_'.$_REQUEST['action'];
        if (is_null($h))
            $h = 'handleJSON_unimplemented';
    }        
    return call_user_func($h, $smarty, $module_name, $local_templates_dir);
}

/* Module language.
 *
 * Issabel has one language for the whole system and its list has no Uzbek.
 * The language switcher of the page (EN / RU / UZ) stores the choice in the
 * cp_lang cookie of the browser; without it the module follows the Issabel
 * language. lang/en.lang holds every key, the chosen file is merged over it. */
function _moduleLanguages()
{
    return array('en' => 'EN', 'ru' => 'RU', 'uz' => 'UZ');
}

function _currentModuleLanguage()
{
    $languages = _moduleLanguages();
    if (isset($_COOKIE['cp_lang']) && is_string($_COOKIE['cp_lang']) && isset($languages[$_COOKIE['cp_lang']]))
        return $_COOKIE['cp_lang'];
    $lang = get_language();
    return isset($languages[$lang]) ? $lang : 'en';
}

// EN / RU / UZ buttons of the status bar (setModuleLanguage() in javascript.js)
function _languageSwitchHTML()
{
    $current = _currentModuleLanguage();
    $html = '';
    foreach (_moduleLanguages() as $code => $label) {
        $html .= '<span class="cp-lang'.($code == $current ? ' is-on' : '').
            '" onclick="setModuleLanguage(\''.$code.'\')">'.$label.'</span>';
    }
    return $html;
}

function _applyModuleLanguage($module_name)
{
    global $arrLang, $arrLangModule;

    if (!isset($_COOKIE['cp_lang'])) return;    // load_language_module() already used the Issabel language
    $lang = _currentModuleLanguage();
    $dir = "modules/$module_name/lang";

    $arrLangModule = array();
    include "$dir/en.lang";
    $strings = $arrLangModule;
    if ($lang != 'en' && file_exists("$dir/$lang.lang")) {
        $arrLangModule = array();
        include "$dir/$lang.lang";
        $strings = array_merge($strings, $arrLangModule);
    }
    $arrLangModule = $strings;
    $arrLang = array_merge(is_array($arrLang) ? $arrLang : array(), $strings);
}

/* Protection against cross-site request forgery (CSRF).
 *
 * The browser attaches the Issabel session cookie to every request to the PBX,
 * whichever page sends it. Without a check, a link or a hidden form on another
 * site could hang up calls, place calls or start call listening in the name of
 * a logged-in user. Actions that change something therefore accept only POST
 * requests whose Origin (or, if missing, Referer) is this same host: the
 * browser sets these headers itself and another page can't fake them. */
function _writeActions()
{
    return array(
        'updateExtensionPanel', 'updatePanelDesc', 'updatePanelSize',
        'callExtension', 'hangupExtension', 'voicemailExtension',
        'resetQueueStats', 'pbxStatusShutdown',
        'spyStart', 'spyStop', 'spyMode',
    );
}

function _isSameOriginPost()
{
    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] != 'POST') return FALSE;
    if (empty($_SERVER['HTTP_HOST'])) return FALSE;

    $source = NULL;
    if (!empty($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] != 'null')
        $source = $_SERVER['HTTP_ORIGIN'];
    elseif (!empty($_SERVER['HTTP_REFERER']))
        $source = $_SERVER['HTTP_REFERER'];
    if (is_null($source)) return FALSE;     // no way to tell where it came from

    $sourceHost = parse_url($source, PHP_URL_HOST);
    $ownHost = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']);   // drop the port
    $ownHost = trim($ownHost, '[]');                                 // IPv6 literal
    return is_string($sourceHost) && strcasecmp(trim($sourceHost, '[]'), $ownHost) == 0;
}

function handleJSON_unimplemented($smarty, $module_name, $local_templates_dir)
{
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode(array(
        'status'    =>  'error',
        'message'   =>  _tr('Unimplemented method'),
    ));
}




function handleHTML_mainReport($smarty, $module_name, $local_templates_dir)
{

    //obtenemos la extension actual del usuario activo
    global $arrConf;



    // Inicialización del estado del módulo
    paloServerSentEvents::generarEstadoHash($module_name, array());
    $pUtils = new paloControlPanelUtils();
    $areaProp = $pUtils->loadAreaProperties();
    foreach (array_keys($areaProp) as $k)
        $areaProp[$k]['description'] = _tr($areaProp[$k]['description']);
    
    // Ember.js requiere jQuery 1.7.2 o superior.
    modificarReferenciasLibreriasJS($smarty, $module_name);

    $json = new Services_JSON();

    $smarty->assign(array(
        'title'                     =>  _tr('Control Panel'),
        'LBL_EDIT_NAME'             =>  _tr('Edit Name'),
        'LBL_SAVE_NAME'             =>  _tr('Save'),
        'icon'                      =>  'modules/'.$module_name.'/images/pbx_operator_panel.png',
        'LBL_NEW'                   =>  _tr('New'),
        'LBL_OLD'                   =>  _tr('Old'),
        'LBL_QUEUE_MEMBERS'         =>  _tr('Members'),
        'LBL_QUEUE_NO_MEMBERS'      =>  _tr('Not Attended'),
        'LBL_QUEUE_CALLERS'         =>  _tr('Callers'),
        'LBL_QUEUE_NO_CALLERS'      =>  _tr('No Callers'),
        'LBL_CONF_PARTICIPANTS'     =>  _tr('Participant(s)'),
        'LBL_PARKED'                =>  _tr('Parked'),
        'LBL_CONNECTED'             =>  _tr('Connected'),
        'LBL_CONNECTING'            =>  _tr('Connecting...'),
        'LBL_EXT_ONLINE'            =>  _tr('Extensions Online'),
        'LBL_EXT_OFFLINE'           =>  _tr('Extensions Offline'),
        'LBL_QUEUE'                 =>  _tr('Queue'),
        'LBL_RESET_STATS'           =>  _tr('Reset statistics'),
        'LBL_ANSWERED'              =>  _tr('Answered'),
        'LBL_ABANDONED'             =>  _tr('Abandoned'),
        'LBL_AGENTS'                =>  _tr('Agents'),
        'LBL_CUSTOMERS_IN_QUEUE'    =>  _tr('Customers in Queue'),
        'LBL_WAITING'               =>  _tr('Waiting'),
        'LBL_LONGEST_WAIT'          =>  _tr('Longest wait'),
        'LBL_ABANDON_RATE'          =>  _tr('Abandon rate'),
        'LBL_AVG_WAIT'              =>  _tr('Avg wait'),
        'LBL_AVG_TALK'              =>  _tr('Avg talk'),
        'LBL_SLA_TITLE'             =>  _tr('Share of calls answered within the service level time'),
        'LBL_AVG_TITLE'             =>  _tr('Running average since the last statistics reset'),
        'LBL_SOUND'                 =>  _tr('Sound'),
        'LBL_LANGUAGE'              =>  _tr('Language'),
        'CP_LANG_SWITCH'            =>  _languageSwitchHTML(),
        'LBL_NOTIFY'                =>  _tr('Notifications'),
        'LBL_EXT_SHORT'             =>  _tr('ext'),
        'LBL_IDLE'                  =>  _tr('idle'),
        'ARRLANG_MAIN'              =>  $json->encode(array(
            'LBL_HIDE_ALL'      =>  _tr('Hide All'),
            'LBL_SHOW_ALL'      =>  _tr('Show All'),
            'LBL_AGENTS'        =>  _tr('Agents'),
            'LBL_ANSWERED'      =>  _tr('Answered'),
            'LBL_ABANDONED'     =>  _tr('Abandoned'),
            'LBL_PAUSED'        =>  _tr('Paused'),
            'LBL_AVAILABLE'     =>  _tr('Available'),
            'LBL_IN_USE'        =>  _tr('In use'),
            'LBL_BUSY'          =>  _tr('Busy'),
            'LBL_NO_AGENTS'     =>  _tr('No agents'),
            'LBL_SEC'           =>  _tr('sec'),
            'LBL_CALLS_TAKEN'   =>  _tr('Calls taken since the last statistics reset'),
            'LBL_SOUND_ON_TITLE'  => _tr('Sound alert is on: beep when a caller waits longer than %s s'),
            'LBL_SOUND_OFF_TITLE' => _tr('Sound alert is off. Click to beep when a caller waits longer than %s s'),
            'LBL_INVALID'       =>  _tr('Invalid'),
            'LBL_UNAVAILABLE'   =>  _tr('Unavailable'),
            'LBL_RINGING'       =>  _tr('Ringing'),
            'LBL_RING_IN_USE'   =>  _tr('Ringing, in use'),
            'LBL_ON_HOLD'       =>  _tr('On Hold'),
            'LBL_RESET_FAILED'  =>  _tr('Failed to reset queue statistics'),
            'LBL_NOTIFY_ON_TITLE'  => _tr('Desktop notifications are on: shown when a caller waits longer than %s s and this page is in the background'),
            'LBL_NOTIFY_OFF_TITLE' => _tr('Desktop notifications are off. Click to get a notification when a caller waits longer than %s s'),
            'LBL_NOTIFY_DENIED' =>  _tr('Notifications are blocked for this site in the browser settings.'),
            'LBL_NOTIFY_TITLE'  =>  _tr('Caller waiting %s'),
            'LBL_NOTIFY_BODY'   =>  _tr('Queue %s'),
            'LBL_SORT_ON_TITLE' =>  _tr('Sorted by state: free first. Click to sort by number'),
            'LBL_SORT_OFF_TITLE'=>  _tr('Sorted by number. Click to sort by state'),
            // Call listening
            'LBL_SPY_BTN_TITLE' =>  _tr('Listen to this agent'),
            'LBL_SPY_TITLE'     =>  _tr('Listen to agent %s'),
            'LBL_SPY_TARGET'    =>  _tr('Call me at'),
            'LBL_SPY_TARGET_PH' =>  _tr('Your extension or external number'),
            'LBL_SPY_RECENT'    =>  _tr('Recent numbers'),
            'LBL_SPY_NO_RECENT' =>  _tr('Numbers you call will be remembered here'),
            'LBL_SPY_REMOVE'    =>  _tr('Remove'),
            'LBL_SPY_MODE_LISTEN'  => _tr('Listen'),
            'LBL_SPY_MODE_WHISPER' => _tr('Whisper'),
            'LBL_SPY_MODE_BARGE'   => _tr('Barge in'),
            'LBL_SPY_MODE_LISTEN_TITLE'  => _tr('You hear the agent and the customer, nobody hears you'),
            'LBL_SPY_MODE_WHISPER_TITLE' => _tr('Only the agent hears you'),
            'LBL_SPY_MODE_BARGE_TITLE'   => _tr('Three-way call: both hear you'),
            'LBL_SPY_KEYS_HINT' =>  _tr('During the call the mode can also be switched with the phone keys: 4 listen, 5 whisper, 6 barge in'),
            'LBL_SPY_CALL'      =>  _tr('Call me'),
            'LBL_CANCEL'        =>  _tr('Cancel'),
            'LBL_SPY_STOP'      =>  _tr('Hang up'),
            'LBL_SPY_BAR'       =>  _tr('Listening to %s'),
            'LBL_SPY_CALLING'   =>  _tr('Calling %s…'),
            'LBL_SPY_CONNECTED' =>  _tr('Call connected'),
            'LBL_SPY_CONFIRM'   =>  _tr('Answer and press 1'),
            'LBL_SPY_CONFIRM_HINT' => _tr('On an external number you will hear a beep after you answer: press 1 to start listening. Voicemail cannot do that, so the conversation never gets there.'),
            'LBL_SPY_ENDED'     =>  _tr('Ended'),
            'LBL_SPY_BAD_NUMBER'=>  _tr('Enter a number: digits, *, # or a leading + (2-20 characters)'),
            'LBL_SPY_FAILED'    =>  _tr('Failed to start listening'),
            'LBL_SPY_NOT_IN_CALL' => _tr('The agent is not in a call anymore'),
            'LBL_SPY_RECONNECT' =>  _tr('This Asterisk version cannot switch the mode during the call. Call you again in the new mode? (You can also press 4/5/6 on the phone.)'),
        )),
        'VAR_INIT'                  =>  $json->encode(array(
            'ESTADO_CLIENTE_HASH'   =>  $_SESSION[$module_name]['estadoClienteHash'],
            'ESTADO_PANELES'        =>  $areaProp,
            'TIMESTAMP_START'       =>  time(),
	   

        )),
    ));
    foreach ($areaProp as $k => $tupla) {
    	$smarty->assign('AREA_DESCR_'.strtoupper($k), $tupla['description']);
    }
    $c = $smarty->fetch($local_templates_dir.'/panel.tpl');
    
    return $c;
}

// A short request returning a fresh, complete snapshot. Authentication has
// already run in Issabel; release its session lock before querying the PBX.
function handleJSON_pbxSnapshot($smarty, $module_name, $local_templates_dir)
{
    session_write_close();
    Header('Content-Type: application/json');
    Header('Cache-Control: no-store');
    require_once "modules/$module_name/libs/paloControlPanelStatus.class.php";
    $panel = new paloControlPanelStatus(TRUE);
    try {
        $response = $panel->snapshot();
    } finally {
        $panel->shutdown();
    }
    $json = new Services_JSON();
    return $json->encode($response);
}

function handleJSON_pbxStatus($smarty, $module_name, $local_templates_dir)
{
    require_once "modules/$module_name/libs/paloControlPanelStatus.class.php";

    $paloSSE = new paloServerSentEvents($module_name, 'paloControlPanelStatus');
    $paloSSE->handle();
    return '';
}

function handleJSON_pbxStatusShutdown($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );
    
	$_SESSION[$module_name]['finalizarEscucha'] = TRUE;
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}



function handleJSON_updateExtensionPanel($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );
    
    if (!isset($_REQUEST['panel']) || !isset($_REQUEST['extension'])) {
    	$respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->updateExtensionPanel($_REQUEST['panel'], $_REQUEST['extension'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_updatePanelDesc($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_REQUEST['panel']) || !isset($_REQUEST['description'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->updatePanelDesc($_REQUEST['panel'], $_REQUEST['description'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_updatePanelSize($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_REQUEST['panelgroup']) || !isset($_REQUEST['width'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->updatePanelSize($_REQUEST['panelgroup'], $_REQUEST['width'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_callExtension($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_REQUEST['source']) || !isset($_REQUEST['target'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->callExtension($_REQUEST['source'], $_REQUEST['target'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_hangupExtension($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_REQUEST['target'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->hangupExtension($_REQUEST['target'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_voicemailExtension($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_REQUEST['source'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->callExtensionVoicemail($_REQUEST['source'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }
    
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function handleJSON_resetQueueStats($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array(
        'status'    =>  'success',
        'message'   =>  '(no message)',
    );

    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] != 'POST' || !isset($_REQUEST['queue'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
    } else {
        $pUtils = new paloControlPanelUtils();
        if (!$pUtils->resetQueueStats($_REQUEST['queue'])) {
            $respuesta['status'] = 'error';
            $respuesta['message'] = $pUtils->errMsg;
        }
    }

    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

/* Call listening (ChanSpy). Sessions started by this user are kept in the
 * PHP session, so status / mode / hangup only work on the user's own calls. */
function _spyJSON($respuesta)
{
    $json = new Services_JSON();
    Header('Content-Type: application/json');
    return $json->encode($respuesta);
}

function _spyOwnSession($module_name)
{
    $uid = isset($_REQUEST['uid']) ? (string)$_REQUEST['uid'] : '';
    if (!paloControlPanelUtils::validSpyId($uid) ||
        !isset($_SESSION[$module_name]['spy'][$uid])) return NULL;
    return $uid;
}

function handleJSON_spyStart($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array('status' => 'success', 'message' => '(no message)');
    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] != 'POST' ||
        !isset($_REQUEST['agent']) || !isset($_REQUEST['target'])) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
        return _spyJSON($respuesta);
    }
    $pUtils = new paloControlPanelUtils();
    $uid = $pUtils->spyStart(trim((string)$_REQUEST['agent']), trim((string)$_REQUEST['target']),
        isset($_REQUEST['mode']) ? (string)$_REQUEST['mode'] : 'listen');
    if ($uid === FALSE) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = $pUtils->errMsg;
    } else {
        $sessions = (isset($_SESSION[$module_name]['spy']) && is_array($_SESSION[$module_name]['spy']))
            ? $_SESSION[$module_name]['spy'] : array();
        $sessions[$uid] = time();
        $_SESSION[$module_name]['spy'] = array_slice($sessions, -20, NULL, TRUE);
        $respuesta['uid'] = $uid;
    }
    session_write_close();
    return _spyJSON($respuesta);
}

function handleJSON_spyStatus($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array('status' => 'success', 'message' => '(no message)');
    $uid = _spyOwnSession($module_name);
    session_write_close();  // AMI below must not block the snapshot requests
    if (is_null($uid)) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
        return _spyJSON($respuesta);
    }
    $pUtils = new paloControlPanelUtils();
    $state = $pUtils->spyStatus($uid);
    if (is_null($state)) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = $pUtils->errMsg;
    } else {
        $respuesta['active'] = $state['active'];
        $respuesta['answered'] = $state['answered'];
        $respuesta['confirming'] = $state['confirming'];
    }
    return _spyJSON($respuesta);
}

function handleJSON_spyStop($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array('status' => 'success', 'message' => '(no message)');
    $uid = _spyOwnSession($module_name);
    session_write_close();
    if (is_null($uid) || !isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] != 'POST') {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
        return _spyJSON($respuesta);
    }
    $pUtils = new paloControlPanelUtils();
    if (!$pUtils->spyStop($uid)) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = $pUtils->errMsg;
    }
    return _spyJSON($respuesta);
}

function handleJSON_spyMode($smarty, $module_name, $local_templates_dir)
{
    $respuesta = array('status' => 'success', 'message' => '(no message)');
    $uid = _spyOwnSession($module_name);
    session_write_close();
    if (is_null($uid) || !isset($_REQUEST['mode']) ||
        !isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] != 'POST') {
        $respuesta['status'] = 'error';
        $respuesta['message'] = _tr('Invalid or missing parameters');
        return _spyJSON($respuesta);
    }
    $pUtils = new paloControlPanelUtils();
    $r = $pUtils->spySetMode($uid, (string)$_REQUEST['mode']);
    if ($r === 'unsupported') {
        $respuesta['unsupported'] = TRUE;
    } elseif ($r !== TRUE) {
        $respuesta['status'] = 'error';
        $respuesta['message'] = $pUtils->errMsg;
    }
    return _spyJSON($respuesta);
}

function modificarReferenciasLibreriasJS($smarty, $module_name)
{
    $listaLibsJS_framework = explode("\n", $smarty->get_template_vars('HEADER_LIBS_JQUERY'));
    $listaLibsJS_modulo = explode("\n", $smarty->get_template_vars('HEADER_MODULES'));

    /* Se busca la referencia a jQuery (se asume que sólo hay una biblioteca que
     * empieza con "jquery-") y se la quita. Las referencias a Ember.js y 
     * Handlebars se reordenan para que Handlebars aparezca antes que Ember.js 
     */ 
    $sEmberRef = $sHandleBarsRef = $sjQueryRef = NULL;
    foreach (array_keys($listaLibsJS_modulo) as $k) {
        if (strpos($listaLibsJS_modulo[$k], 'themes/default/js/jquery-') !== FALSE) {
            $sjQueryRef = $listaLibsJS_modulo[$k];
            unset($listaLibsJS_modulo[$k]);
        } elseif (strpos($listaLibsJS_modulo[$k], 'themes/default/js/handlebars-') !== FALSE) {
            $sHandleBarsRef = $listaLibsJS_modulo[$k];
            unset($listaLibsJS_modulo[$k]);
        } elseif (strpos($listaLibsJS_modulo[$k], 'themes/default/js/ember-') !== FALSE) {
            $sEmberRef = $listaLibsJS_modulo[$k];
            unset($listaLibsJS_modulo[$k]);
        }
    }
    array_unshift($listaLibsJS_modulo, $sEmberRef);
    array_unshift($listaLibsJS_modulo, $sHandleBarsRef);
    
    $smarty->assign('HEADER_MODULES', implode("\n", $listaLibsJS_modulo));

    /* Se busca la referencia original al jQuery del framework, y se reemplaza
     * si es más vieja que el jQuery del módulo */
    $sRegexp = '/jquery-(\d.+?)(\.min)?\.js/'; $regs = NULL;
    preg_match($sRegexp, $sjQueryRef, $regs);
    $sVersionModulo = $regs[1];
    $sVersionFramework = NULL;
    foreach (array_keys($listaLibsJS_framework) as $k) {
        if (preg_match($sRegexp, $listaLibsJS_framework[$k], $regs)) {
            $sVersionFramework = $regs[1];
            
            // Se asume que la versión sólo consiste de números y puntos
            $verFramework = explode('.', $sVersionFramework);
            $verModulo = explode('.', $sVersionModulo);
            while (count($verFramework) < count($verModulo)) $verFramework[] = "0";
            while (count($verFramework) > count($verModulo)) $verModulo[] = "0";
            if ($verModulo > $verFramework) $listaLibsJS_framework[$k] = $sjQueryRef;
        }
    }
    $smarty->assign('HEADER_LIBS_JQUERY', implode("\n", $listaLibsJS_framework));


    
}

function checkAreas() {
    $db = new SQLite3('/var/www/db/control_panel_design.db');

    // Contar cuántas áreas existen
    $countQuery = "SELECT COUNT(*) as count FROM area WHERE name LIKE '%Area%'";
    $result = $db->querySingle($countQuery);

    if ($result !== FALSE) {
        $existingAreasCount = $result;
        $response['existingAreasCount'] = $existingAreasCount;
    } else {
        $response['error'] = 'Error al contar áreas: ' . $db->lastErrorMsg();
    }

    // Insertar áreas adicionales hasta el Área 9 si es necesario
    if ($existingAreasCount < 9) {
        for ($i = $existingAreasCount + 1; $i <= 9; $i++) {
            $areaName = 'Area' . $i;
            $insertQuery = "INSERT INTO area (name, height, width, description, no_column, color)
                VALUES ('$areaName', 100, 1070, 'Area $i', 5, '#E0FFEF');";

            if ($db->query($insertQuery) === FALSE) {
                $response['error'] = 'Error al insertar áreas adicionales: ' . $db->lastErrorMsg();
                break;
            }
        }
    }

    $db->close();

    // Agregar mensaje de éxito si no hay errores
    if (!isset($response['error'])) {
        $response['areasInserted'] = true;
    }

    // Devolver la respuesta en formato JSON
    //echo json_encode($response);
}



?>