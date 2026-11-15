<?php
/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4:
  Codificación: UTF-8
  +----------------------------------------------------------------------+
  | Call Monitoring (control_panel): missed queue calls of today         |
  +----------------------------------------------------------------------+
  | The contents of this file are subject to the General Public License  |
  | (GPL) Version 2 (the "License"); you may not use this file except in |
  | compliance with the License. You may obtain a copy of the License at |
  | http://www.opensource.org/licenses/gpl-license.php                   |
  +----------------------------------------------------------------------+

  Only a class definition: this file is included by index.php and does
  nothing when it is requested directly.
*/

require_once 'libs/misc.lib.php';
require_once 'libs/paloSantoDB.class.php';

/**
 * Missed queue calls of today, one entry per caller number.
 *
 * Sources:
 *  - /var/log/asterisk/queue_log: ENTERQUEUE gives the caller number,
 *    ABANDON / EXITWITHTIMEOUT / EXITEMPTY / EXITWITHKEY a missed call,
 *    CONNECT an answered one (a call that failed over to another queue and
 *    was answered there is not missed);
 *  - CDR (asteriskcdrdb.cdr): calls to the caller number after the missed
 *    call (callbacks), answered or not;
 *  - table cp_callback of the module's SQLite database: callbacks started
 *    from the panel, so other supervisors see "calling back" before the
 *    call reaches the CDR.
 *
 * A number counts as reached ("resolved") when, after its last missed call,
 * it was answered in a queue or an outgoing call to it was answered.
 */
class paloControlPanelMissed
{
    const QUEUE_LOG = '/var/log/asterisk/queue_log';
    const MAX_READ = 16777216;      // read at most 16 MB of today's queue_log
    const MATCH_DIGITS = 9;         // numbers match on their last 9 digits
    const CALLING_SEC = 180;        // a callback shows as running this long

    var $errMsg = '';

    // Comparable form of a phone number: its last MATCH_DIGITS digits
    static function numberKey($number)
    {
        $digits = preg_replace('/[^0-9]/', '', (string)$number);
        if (strlen($digits) < 3) return '';
        return (strlen($digits) > self::MATCH_DIGITS) ? substr($digits, -self::MATCH_DIGITS) : $digits;
    }

    // "Local/102@from-queue/n" or "PJSIP/102" -> "102"; member names as they are
    static function agentLabel($agent)
    {
        if (preg_match('#^[A-Za-z0-9_]+/([0-9]+)#', $agent, $m)) return $m[1];
        return $agent;
    }

    // Table of callbacks started from the panel (in the layout database)
    static function ensureTable($db)
    {
        $db->genExec('CREATE TABLE IF NOT EXISTS cp_callback ('.
            'numkey TEXT, number TEXT, agent TEXT, started INTEGER, user TEXT)');
    }

    // queue_log lines written since $since (unix time) as field arrays,
    // oldest first. The file is read backwards from its end.
    private function _readQueueLog($since)
    {
        $f = @fopen(self::QUEUE_LOG, 'rb');
        if (!$f) {
            $this->errMsg = _tr('Cannot read the queue log').' ('.self::QUEUE_LOG.')';
            return NULL;
        }
        fseek($f, 0, SEEK_END);
        $pos = ftell($f);
        $buf = '';
        $read = 0;
        while ($pos > 0 && $read < self::MAX_READ) {
            $n = min(65536, $pos);
            $pos -= $n;
            fseek($f, $pos);
            $buf = fread($f, $n).$buf;
            $read += $n;
            // The first line of the buffer may be cut; the second is whole
            $nl = strpos($buf, "\n");
            if ($nl !== FALSE) {
                $ts = (int)substr($buf, $nl + 1, 20);
                if ($ts > 0 && $ts < $since) break;
            }
        }
        fclose($f);

        $lines = explode("\n", $buf);
        if ($pos > 0) array_shift($lines);
        $result = array();
        foreach ($lines as $line) {
            $fields = explode('|', rtrim($line, "\r"));
            if (count($fields) < 5 || (int)$fields[0] < $since) continue;
            $result[] = $fields;
        }
        return $result;
    }

    // Calls of today to numbers with at least 7 digits (outgoing calls)
    private function _readCDR($since)
    {
        $db = new paloDB(generarDSNSistema('asteriskuser', 'asteriskcdrdb'));
        if ($db->errMsg != '') return NULL;
        $rows = $db->fetchTable(
            'SELECT UNIX_TIMESTAMP(calldate) AS t, src, dst, disposition, billsec '.
            'FROM cdr WHERE calldate >= FROM_UNIXTIME(?) AND LENGTH(dst) >= 7 ORDER BY calldate',
            TRUE, array($since));
        $db->disconnect();
        return is_array($rows) ? $rows : NULL;
    }

    // Callbacks started from the panel in the last CALLING_SEC seconds
    private function _readCallbacks($now)
    {
        global $arrConf;
        $db = new paloDB($arrConf['dsn_conn_database']);
        if ($db->errMsg != '') return array();
        self::ensureTable($db);
        $rows = $db->fetchTable('SELECT numkey, agent, started FROM cp_callback WHERE started >= ? ORDER BY started',
            TRUE, array($now - self::CALLING_SEC));
        $db->disconnect();
        return is_array($rows) ? $rows : array();
    }

    /**
     * Missed calls of today.
     *
     * @param   int     $since  Start of "today" (unix time), NULL for the
     *                          midnight of PHP's timezone.
     * @return  mixed   array('calls' => list, 'cdr' => bool), NULL on error.
     *                  Each call: number, count, first, last (unix time),
     *                  queue, wait (s), reason (queue_log event), resolved
     *                  (time, agent, how: in|out) or NULL, attempts,
     *                  lastAttempt (time, agent) or NULL, calling (agent,
     *                  started) or NULL.
     */
    function missedToday($since = NULL)
    {
        $now = time();
        // "Today" starts at the browser's midnight: PHP's timezone
        // (date.timezone) is often not the one of the call center
        if (is_null($since) || $since < $now - 2 * 86400 || $since > $now)
            $since = strtotime('today');
        $lines = $this->_readQueueLog($since);
        if (is_null($lines)) return NULL;

        // Queue calls by call id
        $calls = array();
        foreach ($lines as $p) {
            $callid = $p[1];
            if (!isset($calls[$callid]))
                $calls[$callid] = array('number' => '', 'answered' => NULL, 'missed' => NULL);
            $event = $p[4];
            switch ($event) {
            case 'ENTERQUEUE':
                // data: url|callerid|position
                if ($calls[$callid]['number'] === '' && isset($p[6])) $calls[$callid]['number'] = $p[6];
                break;
            case 'CONNECT':
                $calls[$callid]['answered'] = array('time' => (int)$p[0], 'agent' => self::agentLabel($p[3]));
                break;
            case 'ABANDON':         // position|origposition|waittime
            case 'EXITWITHTIMEOUT': // position|origposition|waittime
            case 'EXITEMPTY':       // position|origposition|waittime
            case 'EXITWITHKEY':     // key|position|origposition|waittime
                $i = ($event == 'EXITWITHKEY') ? 8 : 7;
                $calls[$callid]['missed'] = array('time' => (int)$p[0], 'queue' => $p[2],
                    'reason' => $event, 'wait' => isset($p[$i]) ? (int)$p[$i] : 0);
                break;
            }
        }

        // Missed calls per number; answered queue calls per number
        $missed = array();
        $answered = array();
        foreach ($calls as $c) {
            $key = self::numberKey($c['number']);
            if ($key === '') continue;
            if (!is_null($c['answered'])) {
                $answered[$key][] = $c['answered'];
            } elseif (!is_null($c['missed'])) {
                $m = $c['missed'];
                if (!isset($missed[$key])) {
                    $missed[$key] = array('number' => $c['number'], 'count' => 0,
                        'first' => $m['time'], 'last' => 0);
                }
                $entry =& $missed[$key];
                $entry['count']++;
                if ($m['time'] < $entry['first']) $entry['first'] = $m['time'];
                if ($m['time'] >= $entry['last']) {
                    $entry['last'] = $m['time'];
                    $entry['number'] = $c['number'];
                    $entry['queue'] = $m['queue'];
                    $entry['wait'] = $m['wait'];
                    $entry['reason'] = $m['reason'];
                }
                unset($entry);
            }
        }

        $cdr = $this->_readCDR($since);
        $outgoing = array();
        if (is_array($cdr)) foreach ($cdr as $row) {
            $key = self::numberKey($row['dst']);
            if ($key === '' || !isset($missed[$key])) continue;
            $outgoing[$key][] = array('time' => (int)$row['t'], 'agent' => $row['src'],
                'answered' => ($row['disposition'] == 'ANSWERED' && (int)$row['billsec'] > 0));
        }
        $callbacks = array();
        foreach ($this->_readCallbacks($now) as $row) $callbacks[$row['numkey']] = $row;

        $result = array();
        foreach ($missed as $key => $entry) {
            $after = $entry['last'];
            $entry['resolved'] = NULL;
            $entry['attempts'] = 0;
            $entry['lastAttempt'] = NULL;
            $entry['calling'] = NULL;

            // Answered later: in a queue (the customer called again) ...
            if (isset($answered[$key])) foreach ($answered[$key] as $a) {
                if ($a['time'] > $after && (is_null($entry['resolved']) || $a['time'] < $entry['resolved']['time']))
                    $entry['resolved'] = array('time' => $a['time'], 'agent' => $a['agent'], 'how' => 'in');
            }
            // ... or an outgoing call to the number (callback)
            $lastCall = 0;
            if (isset($outgoing[$key])) foreach ($outgoing[$key] as $o) {
                if ($o['time'] <= $after) continue;
                $lastCall = max($lastCall, $o['time']);
                if ($o['answered']) {
                    if (is_null($entry['resolved']) || $o['time'] < $entry['resolved']['time'])
                        $entry['resolved'] = array('time' => $o['time'], 'agent' => $o['agent'], 'how' => 'out');
                } elseif (is_null($entry['lastAttempt']) || $o['time'] - $entry['lastAttempt']['time'] > 10) {
                    // One call may leave several CDR rows (legs): count it once
                    $entry['attempts']++;
                    $entry['lastAttempt'] = array('time' => $o['time'], 'agent' => $o['agent']);
                }
            }
            // A callback started from the panel that has no CDR record yet
            if (is_null($entry['resolved']) && isset($callbacks[$key]) &&
                $callbacks[$key]['started'] > $after && $lastCall < $callbacks[$key]['started'] - 5) {
                $entry['calling'] = array('agent' => $callbacks[$key]['agent'],
                    'started' => (int)$callbacks[$key]['started']);
            }
            $result[] = $entry;
        }
        return array('calls' => $result, 'cdr' => is_array($cdr));
    }
}
?>
