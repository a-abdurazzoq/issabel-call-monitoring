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
require_once 'libs/misc.lib.php';
require_once 'libs/paloSantoDB.class.php';
require_once 'AGI_AsteriskManager2.class.php';

class paloControlPanelUtils
{
    private $_db;
    var $errMsg;

    function __construct()
    {
        global $arrConf;
        $this->_db = new paloDB($arrConf['dsn_conn_database']);
        if ($this->_db->errMsg != '') {
            $this->errMsg = $this->_db->errMsg;
            $this->_db = NULL;
        }
    }

    function loadAreaProperties()
    {
    	$sql = 'SELECT name, width, description, color FROM area ORDER BY id';
        $recordset = $this->_db->fetchTable($sql, TRUE);
        if (!is_array($recordset)) return NULL;
        
        $prop = array();
        foreach ($recordset as $tupla) $prop[$tupla['name']] = $tupla;
        return $prop;
    }
    
    // Leer el ID correspondiente al panel, o NULL si panel no existe
    private function _getPanelID($panel)
    {
    	$tupla = $this->_db->getFirstRowQuery(
            'SELECT id FROM area WHERE name = ?', TRUE, array($panel));
        if (!is_array($tupla)) {
            $this->errMsg = '(internal) Failed to read panel ID - '.$this->_db->errMsg;
        	return NULL;
        }
        if (count($tupla) <= 0) {
            $this->errMsg = '(internal) Panel not found';
        	return NULL;
        }
        return $tupla['id'];
    }
    
    /**
     * Procedimiento que registra que una extensión debe de aparecer en el panel
     * indicado por $panel.
     * 
     * @param   string  $panel      Nombre del panel al que se manda la extensión
     * @param   string  $extension  Extensión a asignar al panel
     * 
     * @return  bool    VERDADERO en caso de éxito, FALSO en error
     */
    function updateExtensionPanel($panel, $extension)
    {
    	$panelid = $this->_getPanelID($panel);
        if (is_null($panelid)) return FALSE;
        $r = $this->_db->genQuery('DELETE FROM item_box WHERE id_device = ?',
            array($extension));
        if (!$r) {
            $this->errMsg = '(internal) Cannot delete old association for extension - '.$this->_db->errMsg;
        	return FALSE;
        }
        $r = $this->_db->genQuery('INSERT INTO item_box (id_area, id_device) VALUES (?, ?)',
            array($panelid, $extension));
        if (!$r) {
            $this->errMsg = '(internal) Cannot create association for extension - '.$this->_db->errMsg;
            return FALSE;
        }
        return TRUE;
    }
    
    /**
     * Procedimiento que registra que un panel debe de tener una nueva descripción
     * 
     * @param   string  $panel          Nombre del panel al que se manda la extensión
     * @param   string  $description    Extensión a asignar al panel
     * 
     * @return  bool    VERDADERO en caso de éxito, FALSO en error
     */
    function updatePanelDesc($panel, $description)
    {
        $panelid = $this->_getPanelID($panel);
        if (is_null($panelid)) return FALSE;
        $r = $this->_db->genQuery('UPDATE area SET description = ? WHERE id = ?',
            array($description, $panelid));
        if (!$r) {
            $this->errMsg = '(internal) Cannot update description for panel - '.$this->_db->errMsg;
            return FALSE;
        }
        return TRUE;
    }
    
    /**
     * Procedimiento que registra un nuevo ancho para un grupo de paneles
     * 
     * @param   string  $panelgroup     Grupo de paneles: 'left', 'right'
     * @param   string  $description    Extensión a asignar al panel
     * 
     * @return  bool    VERDADERO en caso de éxito, FALSO en error
     */
    function updatePanelSize($panelgroup, $width)
    {
    	$panelgroups = array(
            'left'  =>  array('Extension', 'TrunksSIP', 'Trunks'),
            'right' =>  array('Area1', 'Area2', 'Area3', 'Area4', 'Area5', 'Area6', 'Area7', 'Area8', 'Area9', 'Queues', 'Conferences', 'Parkinglots'),
        );
        if (!in_array($panelgroup, array_keys($panelgroups))) {
            $this->errMsg = '(internal) Invalid panel group';
        	return FALSE;
        }
        $num_cols = (int)($width / 186);
        if ($num_cols < 1) $num_cols = 1;
        
        foreach ($panelgroups[$panelgroup] as $panel) {
            $panelid = $this->_getPanelID($panel);
            if (is_null($panelid)) return FALSE;

            $r = $this->_db->genQuery('UPDATE area SET width = ?, no_column = ? WHERE id = ?',
                array($width, $num_cols, $panelid));
            if (!$r) {
                $this->errMsg = '(internal) Cannot update width for panel - '.$this->_db->errMsg;
                return FALSE;
            }
        }
        return TRUE;
    }
    
    /**
     * Procedimiento que inicia una llamada desde la cuenta que corresponde a
     * $source, a la extensión indicada por $target.
     * 
     * @param   string  $source Extensión de la cuenta fuente de la llamada
     * @param   string  $target Extensión a la cual se va a marcar
     * 
     * @return  bool    VERDADERO en éxito, FALSO en error
     */
    function callExtension($source, $target)
    {
        // Verificar fuente y destino para que sean números o #*
        if (!preg_match('/^[[:digit:]#*]+$/', $source)) {
            $this->errMsg = _tr('Invalid source for call');
        	return FALSE;
        }
        if (!preg_match('/^[[:digit:]#*]+$/', $target)) {
            $this->errMsg = _tr('Invalid target for call');
            return FALSE;
        }
    	
        $ami = new AGI_AsteriskManager2();
        if (!$ami->connect('localhost', 'admin', obtenerClaveAMIAdmin())) {
            $this->_errMsg = _tr("Error when connecting to Asterisk Manager");
            return FALSE;
        }
        
        // Leer la cadena de dial para la fuente.
        list($dialchan, $cidname) = $this->_getDialString($ami, $source);
        if ($dialchan === FALSE) {
            $ami->disconnect();
            return FALSE;
        }
        
        // Originar la llamada ahora
        $r = $ami->Originate($dialchan,
            $target, 'from-internal', 1,
            NULL, NULL, NULL, "$cidname <$source>", NULL, NULL);

        $ami->disconnect();
        if ($r['Response'] != 'Success') {
            $this->errMsg = '(internal) failed to Originate call';
            return FALSE;
        }
        return TRUE;
    }
    
    /**
     * Procedimiento que cuelga el primer canal activo asociado con la cuenta
     * que posee la extensión indicada.
     * 
     * @param   string  $target Extensión con un canal activo a colgar
     * 
     * @return  bool    VERDADERO en éxito, FALSO en error
     */
    function hangupExtension($target)
    {
        if (!preg_match('/^[[:digit:]#*]+$/', $target)) {
            $this->errMsg = _tr('Invalid target for call');
            return FALSE;
        }
        
        $ami = new AGI_AsteriskManager2();
        if (!$ami->connect('localhost', 'admin', obtenerClaveAMIAdmin())) {
            $this->_errMsg = _tr("Error when connecting to Asterisk Manager");
            return FALSE;
        }
        
        // Leer la cadena de dial para la fuente.
        list($dialchan, $cidname) = $this->_getDialString($ami, $target);
        if ($dialchan === FALSE) {
            $ami->disconnect();
            return FALSE;
        }
        
        // Listar los canales activos y buscar el que tiene como prefijo el $dialchan
        $r = $ami->Command('core show channels concise');        
        if ($r['Response'] != 'Follows') {
            $this->errMsg = _tr('(internal) Failed to list channels');
        	return FALSE;
        }
        $channel = NULL;
        foreach (explode("\n", $r['data']) as $s) {
        	$tupla = explode('!', $s);
            if (count($tupla) >= 11 && strpos($tupla[0], $dialchan) === 0) {
                $channel = $tupla[0];
            	break;
            }
        }        
        if (is_null($channel)) {
            $this->errMsg = _tr('No active channels for target');
        	$ami->disconnect();
            return FALSE;
        }
        
        // Colgar el canal que ha sido encontrado
        $r = $ami->Hangup($channel);
        $ami->disconnect();
        if ($r['Response'] != 'Success') {
            $this->errMsg = _tr('(internal) Failed to hangup active channel for target');
            return FALSE;
        }
        return TRUE;
    }
    
    /**
     * Reset the statistics (answered/abandoned counters) of a queue through
     * AMI. Replaces the old libs/utilities.php endpoint, which passed the
     * queue name unvalidated to shell_exec() without any authentication.
     *
     * @param   string  $queue  Queue name (FreePBX: queue number)
     *
     * @return  bool    TRUE on success, FALSE on error
     */
    function resetQueueStats($queue)
    {
        if (!preg_match('/^[A-Za-z0-9_.\-]{1,64}$/', $queue)) {
            $this->errMsg = _tr('Invalid queue');
            return FALSE;
        }

        $ami = new AGI_AsteriskManager2();
        if (!$ami->connect('localhost', 'admin', obtenerClaveAMIAdmin())) {
            $this->errMsg = _tr('Error when connecting to Asterisk Manager');
            return FALSE;
        }
        $r = $ami->Command('queue reset stats '.$queue);
        $ami->disconnect();
        if (!isset($r['Response']) || !in_array($r['Response'], array('Success', 'Follows'))) {
            $this->errMsg = _tr('Failed to reset queue statistics');
            return FALSE;
        }
        return TRUE;
    }

    /**************************************************************************
     * Call listening (ChanSpy), started from the queue card.
     *
     * Asterisk calls the supervisor at a number entered in the browser (own
     * extension or an external number) and connects that call to ChanSpy on
     * the agent's phone, as FreePBX's own targeted-chanspy does:
     *   q  no beep / channel name, d  keys 4/5/6 on the supervisor's phone
     *   switch listen / whisper / barge, E  end when the agent's call ends.
     * An own extension runs ChanSpy right after the answer. An external number
     * goes through the dialplan context cp-spy-confirm: the supervisor hears a
     * beep and must press 1, so voicemail never receives the conversation.
     * A session is identified by the uniqueid given to the originated channel
     * (ChannelId), so it can be checked, switched and hung up later.
     **************************************************************************/

    private static $_spyModes = array('listen' => '', 'whisper' => 'w', 'barge' => 'B');
    private static $_spyKeys  = array('listen' => '4', 'whisper' => '5', 'barge' => '6');

    // Dialplan context of asterisk/extensions_cp_spy.conf
    const SPY_CONFIRM_CONTEXT = 'cp-spy-confirm';

    // Whether Asterisk has loaded the confirmation context
    private function _hasConfirmContext($ami)
    {
        $r = $ami->Command('dialplan show s@'.self::SPY_CONFIRM_CONTEXT);
        $data = (is_array($r) && isset($r['data'])) ? $r['data'] : '';
        return strpos($data, "Context '".self::SPY_CONFIRM_CONTEXT."'") !== FALSE;
    }

    static function validSpyId($uid)
    {
        return is_string($uid) && preg_match('/^cpspy-\d{1,12}-\d{1,9}$/', $uid);
    }

    private function _amiConnect()
    {
        $ami = new AGI_AsteriskManager2();
        $ami->setDeadline(microtime(TRUE) + 5);
        if (!$ami->connect('localhost', 'admin', obtenerClaveAMIAdmin(), 'off')) {
            $this->errMsg = _tr('Error when connecting to Asterisk Manager');
            return NULL;
        }
        return $ami;
    }

    // Dial strings (e.g. "PJSIP/102") of the devices of a FreePBX user
    private function _deviceDialStrings($ami, $extension)
    {
        $list = array();
        $devices = $ami->database_get('AMPUSER', "$extension/device");
        if (!is_string($devices) || $devices === '') return $list;
        foreach (explode('&', $devices) as $device) {
            $device = trim($device);
            if ($device === '') continue;
            $dial = $ami->database_get('DEVICE', "$device/dial");
            if (is_string($dial) && preg_match('#^[A-Za-z0-9_]+/[^\s,&!]+$#', $dial)) $list[] = $dial;
        }
        return $list;
    }

    // "core show channels concise" as a list of fields per channel, NULL on error
    private function _listChannels($ami)
    {
        $r = $ami->Command('core show channels concise');
        if (!is_array($r) || !isset($r['Response']) || !in_array($r['Response'], array('Follows', 'Success')))
            return NULL;
        $list = array();
        foreach (explode("\n", isset($r['data']) ? $r['data'] : '') as $s) {
            $fields = explode('!', trim($s));
            if (count($fields) >= 11) $list[] = $fields;
        }
        return $list;
    }

    // Channels of a listening session: the originated channel and, for an
    // external number, the second half of its Local channel.
    private function _spyChannels($channels, $uid)
    {
        $found = array();
        foreach ($channels as $fields) {
            if (in_array($uid, $fields, TRUE) || in_array($uid.'-2', $fields, TRUE))
                $found[] = $fields;
        }
        return $found;
    }

    /**
     * Start listening to an agent.
     *
     * @param   string  $agent  Agent extension (FreePBX user)
     * @param   string  $target Number to call: extension or external number
     * @param   string  $mode   listen | whisper | barge
     *
     * @return  mixed   Session id, or FALSE on error
     */
    function spyStart($agent, $target, $mode)
    {
        if (!preg_match('/^[0-9]{1,20}$/', $agent)) {
            $this->errMsg = _tr('Invalid agent');
            return FALSE;
        }
        if (!preg_match('/^\+?[0-9*#]{2,20}$/', $target)) {
            $this->errMsg = _tr('Invalid number');
            return FALSE;
        }
        if ($target === $agent) {
            $this->errMsg = _tr('Enter your own number, not the agent\'s');
            return FALSE;
        }
        if (!isset(self::$_spyModes[$mode])) $mode = 'listen';

        $ami = $this->_amiConnect();
        if (is_null($ami)) return FALSE;

        // Agent: spy on the device that is in a call now, otherwise the first one
        $agentDials = $this->_deviceDialStrings($ami, $agent);
        if (count($agentDials) <= 0) {
            $ami->disconnect();
            $this->errMsg = _tr('The agent has no phone device');
            return FALSE;
        }
        $spyPrefix = $agentDials[0];
        $channels = $this->_listChannels($ami);
        if (is_array($channels)) foreach ($agentDials as $dial) {
            foreach ($channels as $fields) {
                if (strpos($fields[0], $dial.'-') === 0) { $spyPrefix = $dial; break 2; }
            }
        }

        /* Supervisor: an own extension rings the phone directly, so that an
         * unanswered call never ends in voicemail or follow-me (which would
         * record the conversation). Anything else goes out through the
         * outbound routes; the shorter timeout keeps it ahead of mobile
         * voicemail. */
        $uid = 'cpspy-'.time().'-'.mt_rand(100000, 999999);
        $label = str_replace(array('"', '<', '>'), '', _tr('Listen')).' '.$agent;
        $request = array(
            'Channel'        => NULL,
            'CallerID'       => '"'.$label.'" <'.$agent.'>',
            'Timeout'        => NULL,
            'Async'          => 'true',
            'ChannelId'      => $uid,
            'OtherChannelId' => $uid.'-2',
        );
        $targetDials = preg_match('/^[0-9]+$/', $target) ? $this->_deviceDialStrings($ami, $target) : array();
        if (count($targetDials) > 0) {
            $request['Channel'] = $targetDials[0];
            $request['Timeout'] = 30000;
            $request['Application'] = 'ChanSpy';
            $request['Data'] = $spyPrefix.'-,qdE'.self::$_spyModes[$mode];
        } else {
            /* External number: the call goes to the dialplan context
             * cp-spy-confirm (installed by install.sh), which starts ChanSpy
             * only after the supervisor presses 1. Without that context the
             * number is refused instead of being called unconfirmed. */
            if (!$this->_hasConfirmContext($ami) || strpos($spyPrefix, '^') !== FALSE) {
                $ami->disconnect();
                $this->errMsg = _tr('Listening on an external number needs the confirmation dialplan: run install.sh on the PBX');
                return FALSE;
            }
            $request['Channel'] = 'Local/'.$target.'@from-internal';
            $request['Timeout'] = 20000;
            $request['Context'] = self::SPY_CONFIRM_CONTEXT;
            $request['Exten'] = 's';
            $request['Priority'] = '1';
            $request['Variable'] = 'CP_SPY='.$spyPrefix.'^'.self::$_spyModes[$mode];
        }

        $r = $ami->send_request('Originate', $request);
        $ami->disconnect();
        if (!is_array($r) || !isset($r['Response']) || $r['Response'] != 'Success') {
            $this->errMsg = _tr('Failed to start listening');
            return FALSE;
        }
        return $uid;
    }

    /**
     * State of a listening session.
     *
     * confirming: an external number answered and the dialplan waits for 1.
     *
     * @return  mixed   array('active', 'answered', 'confirming' => bool), NULL on error
     */
    function spyStatus($uid)
    {
        $ami = $this->_amiConnect();
        if (is_null($ami)) return NULL;
        $channels = $this->_listChannels($ami);
        $ami->disconnect();
        if (!is_array($channels)) {
            $this->errMsg = _tr('(internal) Failed to list channels');
            return NULL;
        }
        $state = array('active' => FALSE, 'answered' => FALSE, 'confirming' => FALSE);
        foreach ($this->_spyChannels($channels, $uid) as $fields) {
            $state['active'] = TRUE;
            if (!in_array($uid, $fields, TRUE)) continue;
            // Fields: channel, context, exten, priority, state, application
            $spying = (strcasecmp($fields[5], 'ChanSpy') == 0);
            if (strcasecmp($fields[4], 'Up') == 0 || $spying) $state['answered'] = TRUE;
            if ($fields[1] === self::SPY_CONFIRM_CONTEXT && !$spying && strcasecmp($fields[4], 'Up') == 0)
                $state['confirming'] = TRUE;
        }
        return $state;
    }

    // Hang up a listening session (also when it is still ringing)
    function spyStop($uid)
    {
        $ami = $this->_amiConnect();
        if (is_null($ami)) return FALSE;
        $channels = $this->_listChannels($ami);
        if (!is_array($channels)) {
            $ami->disconnect();
            $this->errMsg = _tr('(internal) Failed to list channels');
            return FALSE;
        }
        foreach ($this->_spyChannels($channels, $uid) as $fields) $ami->Hangup($fields[0]);
        $ami->disconnect();
        return TRUE;
    }

    /**
     * Switch listen / whisper / barge during a session by "pressing" 4/5/6 on
     * the supervisor's channel (PlayDTMF with Receive). Older Asterisk
     * versions have no Receive option: then 'unsupported' is returned and the
     * browser offers to call again in the new mode.
     *
     * @return  mixed   TRUE, 'unsupported' or FALSE on error
     */
    function spySetMode($uid, $mode)
    {
        if (!isset(self::$_spyKeys[$mode])) {
            $this->errMsg = _tr('Invalid or missing parameters');
            return FALSE;
        }
        $ami = $this->_amiConnect();
        if (is_null($ami)) return FALSE;

        $r = $ami->Command('manager show command PlayDTMF');
        $help = (is_array($r) && isset($r['data'])) ? $r['data'] : '';
        if (stripos($help, 'Receive') === FALSE) {
            $ami->disconnect();
            return 'unsupported';
        }
        $channels = $this->_listChannels($ami);
        $channel = NULL;
        if (is_array($channels)) foreach ($channels as $fields) {
            if (in_array($uid, $fields, TRUE)) { $channel = $fields; break; }
        }
        if (is_null($channel)) {
            $ami->disconnect();
            $this->errMsg = _tr('The listening call has ended');
            return FALSE;
        }
        // Before ChanSpy runs, a key would go to the "press 1" prompt instead
        if (strcasecmp($channel[5], 'ChanSpy') != 0) {
            $ami->disconnect();
            $this->errMsg = ($channel[1] === self::SPY_CONFIRM_CONTEXT && strcasecmp($channel[4], 'Up') == 0)
                ? _tr('Press 1 on the phone first')
                : _tr('Answer the call first');
            return FALSE;
        }
        $channel = $channel[0];
        $r = $ami->send_request('PlayDTMF', array(
            'Channel' => $channel,
            'Digit'   => self::$_spyKeys[$mode],
            'Receive' => 'true',
        ));
        $ami->disconnect();
        if (!is_array($r) || !isset($r['Response']) || $r['Response'] != 'Success') {
            $this->errMsg = _tr('Failed to switch the listening mode');
            return FALSE;
        }
        return TRUE;
    }

    // Leer la cadena de dial para la fuente. Este método depende de FreePBX
    private function _getDialString($ami, $source)
    {
        $dialchan = $ami->database_get('DEVICE', "$source/dial");
        if ($dialchan === FALSE) {
            $this->_errMsg = _tr("Failed to query dialchannel for source extension");
            return array(NULL, NULL);
        }
        $cidname = $ami->database_get('AMPUSER', "$source/cidname");
        if ($cidname === FALSE) $cidname = '(unknown)';

        return array($dialchan, $cidname);
    }
    
    /**
     * Procedimiento que inicia una llamada desde la cuenta que corresponde a
     * $source, a la extensión de voicemail. La extensión a marcar para el 
     * voicemail se recupera a través de una consulta a la base de datos 
     * FreePBX.
     * 
     * @param   string  $source Extensión de la cuenta fuente de la llamada
     * 
     * @return  bool    VERDADERO en éxito, FALSO en error
     */
    function callExtensionVoicemail($source)
    {
        // Abrir conexión a la base de datos de FreePBX
        $dsn = generarDSNSistema('asteriskuser', 'asterisk');
        $db = new paloDB($dsn);
        if ($db->errMsg != '') {
            $this->errMsg = $db->errMsg;
            $db->disconnect();
            $db = NULL;
            return FALSE;            
        }
        
        // Consulta del código correspondiente al voicemail
        $target = '*97';   // Valor por omisión de la extensión de voicemail
        $sql =
            'SELECT defaultcode, customcode FROM featurecodes '.
            'WHERE modulename = "voicemail" AND featurename = "myvoicemail"';
        $tupla = $db->getFirstRowQuery($sql, TRUE);
        if (!is_array($tupla)) {
            $this->errMsg = $db->errMsg;
            $db->disconnect();
            $db = NULL;
            return FALSE;
        }
        if (isset($tupla['customcode']) && !is_null($tupla['customcode']))
            $target = $tupla['customcode'];
        elseif (isset($tupla['defaultcode']) && !is_null($tupla['defaultcode']))
            $target = $tupla['defaultcode'];

        return $this->callExtension($source, $target);
    }
}
?>
