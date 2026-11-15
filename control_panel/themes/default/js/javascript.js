// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind
if (!Function.prototype.bind) {
	Function.prototype.bind = function (oThis) {
		if (typeof this !== "function") {
			// closest thing possible to the ECMAScript 5 internal IsCallable function
			throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
		}

		var aArgs = Array.prototype.slice.call(arguments, 1), 
        	fToBind = this, 
        	fNOP = function () {},
        	fBound = function () {
        		return fToBind.apply(this instanceof fNOP && oThis
                                 ? this
                                 : oThis,
                               aArgs.concat(Array.prototype.slice.call(arguments)));
        };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();

        return fBound;
	};
}


// IE6 e IE8 funcionan incorrectamente al anidar draggables
// http://bugs.jqueryui.com/ticket/4333
$.extend($.ui.draggable.prototype, (function (orig) {
          return {
            _mouseCapture: function (event) {
              var result = orig.call(this, event);
              if (result && $.browser.msie) event.stopPropagation();
              return result;
            }
          };
})($.ui.draggable.prototype["_mouseCapture"]));


var module_name = 'control_panel';
var App = null;

// Retain unchanged models; transmit only changed or removed channel records.
function applyCallCollectionChanges(pbxobject, changes) {
    for (var field in changes) {
        if (field !== 'active' && field !== 'callers') continue;
        var delta = changes[field];
        var current = pbxobject.get(field) || [];
        var replaced = Object.create(null);
        delta.remove.forEach(function(channel) { replaced[channel] = true; });
        delta.upsert.forEach(function(call) { replaced[call.Channel] = true; });
        var next = current.filter(function(call) {
            var channel = typeof call.get === 'function' ? call.get('Channel') : call.Channel;
            return !replaced[channel];
        });
        delta.upsert.forEach(function(call) {
            if (field === 'active') {
                call.localExtension = pbxobject.get('extension');
                next.push(App.ActiveChannel.create(call));
            } else {
                next.push(call);
            }
        });
        if (field === 'callers') {
            next.sort(function(a, b) { return (a.Position || 0) - (b.Position || 0); });
        }
        pbxobject.set(field, next);
    }
}

//Redireccionar la página entera en caso de que la sesión se haya perdido
function verificar_error_session(respuesta)
{
	if (respuesta['statusResponse'] == 'ERROR_SESSION') {
		if (respuesta['error'] != null && respuesta['error'] != '')
			alert(respuesta['error']);
		window.open('index.php', '_self');
	}
}

$(document).ready(function() {
	// Inicialización de Ember.js
	App = Ember.Application.create({
		/*
		LOG_TRANSITIONS: true,
		LOG_ACTIVE_GENERATION: true,
		LOG_VIEW_LOOKUPS: true,
		*/
		rootElement:	'#controlPanelApplication'
	});
	initializeJQueryUIViews();
	/* Este objeto contiene un timer regular que actualiza la propiedad tick500
	 * cada 500 milisegundos. Si algún objeto tiene una propiedad computada que
	 * observa la propiedad tick500, tendrá la oportunidad de actualizar un
	 * contador de tiempo. */
	App.Ticks = Ember.Object.extend({
		serverdiff: null,	// Diferencia entre servidor y cliente
		timer: null,
		
		// La propiedad que actualiza la estimación de la hora del SERVIDOR
		tick500: null,
		
		// Iniciar la estimación de la hora del SERVIDOR
		initTick: function(v) {
			if (this.get('tick500') == null) this.set('tick500', v);
			
			var ahora = new Date();
			var d = new Date();
			d.setTime(v * 1000 - ahora.getTime());
			this.set('serverdiff', d);
						
			if (this.timer != null) clearInterval(this.timer);
			this.timer = setInterval(this.updateTick.bind(this), 500);
		},
		
		updateTick: function() {
			var ahora = new Date();
			this.set('tick500', ahora.getTime() + this.get('serverdiff').getTime());
		}
	});
	App.ticks = App.Ticks.create({});
	App.ticks.initTick(var_init['TIMESTAMP_START']);
	
	/* Este objeto representa un canal activo dentro de una extensión o troncal */
	App.ActiveChannel = Ember.Object.extend({
		Channel:			null,
		CallerIDNum:		null,
		CallerIDName:		null,
		Since:				null,
		BridgedChannel:		null,
		ConnectedLineNum:	null,
		ConnectedLineName:	null,
		ChannelStateDesc:	null,
		Context:			null,
		Extension:			null,
		Priority:			null,
		Application:		null,
		AppData:			null,
		
        localExtension: null,
        remoteExten: function() {
            // A dialplan destination can be this phone's own extension. Prefer
            // the connected party, then a remote dialled number, then caller ID.
            var local = this.get('localExtension');
            var fields = ['ConnectedLineNum', 'Extension', 'CallerIDNum'];
            for (var i = 0; i < fields.length; i++) {
                var number = this.get(fields[i]);
                if (number != null && number !== '' && number !== '<unknown>' &&
                    number !== 'unknown' && (local == null || String(number) !== String(local))) {
                    return number;
                }
            }
            return null;
        }.property('localExtension', 'Extension', 'ConnectedLineNum', 'CallerIDNum'),
		formatSince: function() {
			var since = this.get('Since');
			//console.log(since);
			if (since == null) return '???';
			return formatoMilisegundo((App.ticks.get('tick500') - since * 1000));
		}.property('App.ticks.tick500')
	});
	
	/* Este objeto representa una extensión telefónica local al servidor */
	App.Extension = Ember.Object.extend({
		channel:		null,
		tech:			null,
		extension:		null,
		description:	null,
		current_area:	'Extension',	// Extension,Area1,Area2,Area3
		mailbox:		null,
		UrgMessages:	0,
		NewMessages:	0,
		OldMessages:	0,
		ip:				null,
		registered:		false,
		active:			null,
		
		init: function() {
			var active = this.get('active');
			if (active == null) active = [];
			this.setActive(active);
		},
		idattr: function() {
			return this.get('channel');
		}.property('channel'),
		
		setActive: function(active) {
    //console.log(active);
    for (var i = 0; i < active.length; i++) {
        active[i].localExtension = this.get('extension');
        active[i] = App.ActiveChannel.create(active[i]);
    }
    this.set('active', active);
},

		// Estado de la extensión o troncal: Up|Ringing|Down
		trunkstate: function () {
			var active = this.get('active');
			var ringing = false;
			for (var i = 0; i < active.length; i++) {
				var st = active[i].get('ChannelStateDesc');
				if (st == 'Up') return 'Up';
				if (st == 'Ringing' || st == 'Ring') ringing = true;
			}
			return ringing ? 'Ringing' : 'Down';
		}.property('active', 'active.@each.ChannelStateDesc'),
		
		// Bandera que indica si hay nuevos mensajes
		unreadMail: function() {
			return (this.get('NewMessages') > 0);
		}.property('NewMessages'),
		
		// Observador que guarda el área asignada a esta extensión
		saveArea: function() {
			$.post('index.php?menu=' + module_name + '&rawmode=yes', {
				menu:		module_name, 
				rawmode:	'yes',
				action:		'updateExtensionPanel',
				panel:		this.get('current_area'),
				extension:	this.get('extension')
			},
			function(respuesta) {
				verificar_error_session(respuesta);
				if (respuesta.status == 'error') {
					alert(respuesta.message);
				}
			}.bind(this), 'json');
		}.observes('current_area')
	});
	
	/* Este objeto representa una troncal IP */
	App.IPTrunk = Ember.Object.extend({
		channel:		null,
		tech:			null,
		description: function () {
			return this.get('channel');
		}.property('channel'),
		ip:				null,
		registered:		false,
		active:			null,
		
		init: function() {
			var active = this.get('active');
			if (active == null) active = [];
			this.setActive(active);
		},
		idattr: function() {
			return this.get('channel');
		}.property('channel'),
		// Actualizar los canales activos según la lista indicada
		setActive: function(active) {
			for (var i = 0; i < active.length; i++)
				active[i] = App.ActiveChannel.create(active[i]);
			this.set('active', active);
		}
	});
	
	/* Este objeto representa una sola línea física de un span DAHDI */
	App.DAHDIChan = Ember.Object.extend({
		chan:		null,	// Número de la línea física
		active:		null,	// Lista de canales no asociados con una línea física
		Alarm:		null,	// Alarma asociada al canal
		init: function() {
			var active = this.get('active');
			if (active == null) active = [];
			this.setActive(active);
		},
		// Actualizar los canales activos según la lista indicada
		setActive: function(active) {
			for (var i = 0; i < active.length; i++)
				active[i] = App.ActiveChannel.create(active[i]);
			this.set('active', active);
		},
		alarmstyle: function () {
			var style = 'display: inline-block; min-width: 10px; padding: 2px;';
			switch (this.get('Alarm')) {
			case 'No Alarm':		style += 'background-color: green;'; break;
			case 'Red Alarm':		style += 'background-color: red;'; break;
			case 'Yellow Alarm':	style += 'background-color: yellow;'; break;
			case 'Blue Alarm':		style += 'background-color: blue;'; break;
			case 'Recovering':		style += 'background-color: orange;'; break;
			case 'Loopback':		style += 'background-color: purple;'; break;
			case 'Not Open':		style += 'background-color: silver;'; break;
			case 'None':			style += 'background-color: black;'; break;
			}
			return style;
		}.property('Alarm')
	});
	
	/* Este objeto representa un span DAHDI que contiene líneas telefónicas */
	App.DAHDISpan = Ember.Object.extend({
		span:		null,	// Número del span
		active:		null,	// Lista de canales no asociados con una línea física
		chan:		null,	// Lista de líneas físicas
		
		init: function() {
			var active = this.get('active');
			if (active == null) active = [];
			this.setActive(active);
			
			var chan = this.get('chan');
			if (chan == null) chan = [];
			this.setChan(chan);
		},
		idattr: function() {
			return 'DAHDI/' + this.get('span');
		}.property('span'),
		// Actualizar los canales activos según la lista indicada
		setActive: function(active) {
			for (var i = 0; i < active.length; i++)
				active[i] = App.ActiveChannel.create(active[i]);
			this.set('active', active);
		},
		setChan: function (chan) {
			for (var i = 0; i < chan.length; i++)
				chan[i] = App.DAHDIChan.create(chan[i]);
			this.set('chan', chan);
		},
		formatChanRange: function() {
			var chanlist = this.get('chan').mapBy('chan');
			var spanstart = null;
			var spanend = null;
			var spandesc = '';
			
			for (var i = 0; i < chanlist.length; i++) {
				if (spanstart == null) {
					spanstart = spanend = chanlist[i];
				} else if (spanend + 1 == chanlist[i]) {
					spanend = chanlist[i];
				} else {
					if (spandesc != '') spandesc += ',';
					spandesc += spanstart + '-' + spanend;
					spanstart = spanend = chanlist[i];
				}
			}
			if (spandesc != '') spandesc += ',';
			spandesc += spanstart + '-' + spanend;
			return spandesc;
		}.property('chan.@each')
	});
	
	/* Este objeto representa un miembro de una cola */
	App.QueueMember = Ember.Object.extend({
		fullchannel: null,
		shortchannel: function() {
			var regexp = /^.+?\/(\d+)/;
			var regs = regexp.exec(this.get('fullchannel'));
			return (regs != null) ? regs[1] : this.get('fullchannel');
		}.property('fullchannel')
	});
	App.Queue = Ember.Object.extend({
		extension:		null,
		description:	null,
		members:		null,
		callers:		null,
		
		init: function() {
			if (this.get('callers') == null) this.set('callers', []);
			var members = this.get('members');
			if (members == null) members = [];
			this.setMembers(members);
		},
		idattr: function() {
			return 'QUEUE/' + this.get('extension');
		}.property('extension'),
	
		setMembers: function (members) {
			//console.log(members)
			for (var i = 0; i < members.length; i++)
				members[i] = App.QueueMember.create({
					fullchannel: members[i]
				});
			this.set('members', members);
		}
	});


	App.Conference = Ember.Object.extend({
		extension:		null,
		description:	null,
		callers:		null,
		Since:			null,

		init: function() {
			if (this.get('callers') == null) this.set('callers', []);
		},
		idattr: function() {
			return 'CONFERENCE/' + this.get('extension');
		}.property('extension'),
		updateConfStart: function() {
			var callers = this.get('callers');
			if (callers.length <= 0) {
				this.set('Since', null);
				return;
			}
			var since = this.get('Since');
			for (var i = 0; i < callers.length; i++) {
				if (since == null || callers[i].ConfSince < since) {
					since = callers[i].ConfSince;
				}
			}
			this.set('Since', since);
		}.observes('callers.@each'),
		formatSince: function() {
			var since = this.get('Since');
			if (since == null) return '???';
			return formatoMilisegundo((App.ticks.get('tick500') - since * 1000));
		}.property('Since', 'App.ticks.tick500')
	});
	
	App.Parkinglot = Ember.Object.extend({
		extension:	null,
		Channel:	null,
		Since:		null,
		Timeout:	null,
		
		idattr: function() {
			return 'PARKLOT/' + this.get('extension');
		}.property('extension'),
		shortchannel: function() {
			var regexp = /^.+?\/(\d+)/;
			var regs = regexp.exec(this.get('Channel'));
			return (regs != null) ? regs[1] : this.get('Channel');
		}.property('Channel'),
		formatTimeout: function() {
			var since = this.get('Since');
			var timeout = this.get('Timeout');
			if (since == null || timeout == null) return '???';
			return formatoMilisegundo(((since + timeout) * 1000 - App.ticks.get('tick500')));
		}.property('Since', 'Timeout', 'App.ticks.tick500')
	});
	
	/* El siguiente controlador contiene una lista de objetos que se actualizan
	 * dentro de un panel. Estos objetos que se actualizan pueden ser 
	 * extensiones, troncales, colas, o conferencias. */
	App.PBXPanelController = Ember.ArrayController.extend({
		name:				null,
		width:				null,
		height:				null,
		color:				null,
		description:		null,
		typedclass:			null,	// Clase para inicializar hijos
		parentcontroller:	null,	// Controlador del desktop
		finishedloading:	false,
		
		editing: false,
		
		actions: {
			edit: function () {
				this.set('editing', true);
			},
			save: function () {
				$.post('index.php?menu=' + module_name + '&rawmode=yes', {
					menu:		module_name, 
					rawmode:	'yes',
					action:		'updatePanelDesc',
					panel:		this.get('name'),
					description:this.get('description')
				},
				function(respuesta) {
					verificar_error_session(respuesta);
					if (respuesta.status == 'error') {
						alert(respuesta.message);
					}
				}.bind(this), 'json');
				this.set('editing', false);
			},
			dialvoicemail: function(sourceExtension) {
				$.post('index.php?menu=' + module_name + '&rawmode=yes', {
					menu:		module_name, 
					rawmode:	'yes',
					action:		'voicemailExtension',
					source:		sourceExtension.get('extension')
				},
				function(respuesta) {
					verificar_error_session(respuesta);
					if (respuesta.status == 'error') {
						alert(respuesta.message);
					}
				}.bind(this), 'json');
			}
		},
		findIndexBy: function(key, value) {
			for (var i = 0; i < this.get('length'); i++) {
				if (this.objectAt(i).get(key) == value) {
					return i;
				}
			}
			return null;
		},
		addTypedObject: function(obj) {
			var typedclass = this.get('typedclass');
			if (typedclass == null) {
				console.debug('Uninitialized typedclass');
				console.debug(obj);
				return;
			}
			this.addObject(typedclass.create(obj));
		}
	});

	/* La siguiente vista es la vista base que se usa para representar un panel. */
	App.PBXPanelView = Ember.View.extend(JQ.Widget, {
		uiType: ['resizable'],
		uiOptions: ['autoHide', 'minWidth', 'minHeight'],
		uiEvents: ['stop'],
		tagName: 'li',
        autoHide: true,	// Esconder manijas de redimensionamiento
        minWidth: 380,
        minHeight: 100,
		
		stop: function (event, ui) {
			var controller = this.get('controller');
			var desktopController = this.get('parentView.controller');
			desktopController.updatePanelSize(controller.get('name'), ui.size.width, ui.size.height);
		},
     
		classNames: ['pbxpanel'],
		attributeBindings: ['style'],
		style: function() {
			var s = '';
			//if (this.get('controller.width') != null) s += 'width: ' + this.get('controller.width') + 'px; ';
			if (this.get('controller.height') != null) s += 'height: ' + this.get('controller.height') + 'px; ';
			//if (this.get('controller.color') != null) s += 'background-color: ' + this.get('controller.color') + '; ';
			return s;
		}.property('controller.width', 'controller.height', 'controller.color')
	});
	App.EditableTitleView = Ember.View.extend({
		tagName: 'dt',
		templateName: 'editable-title'
	});
	App.SortablePanelView = Ember.View.extend(JQ.Widget, {
		uiType:			'sortable',
		uiOptions:		['connectWith', 'revert', 'cursor'],
		uiEvents:		['receive', 'update'],
		classNames:		['sortablepanelview'],
		connectWith:	'.sortablepanelview',
		revert:			true,
		cursor:			'crosshair',
		
		// Obtener índice donde colocar el item, o null si se coloca al final
		getInsertPos: function(item) {
			var controller = this.get('controller');
			var insertpos = null;
			var place_id = item.nextAll('div').first().attr('data-idattr');
			
			if (place_id != null) {
				insertpos = controller.findIndexBy('idattr', place_id);
			}
			return insertpos;
		},
		
		update: function (event, ui) {
			var sel = '#' + ui.item.attr('id');
			var div_set = this.get('ui').children(sel);
			
			/* El evento update se ejecuta para todo cambio de DOM en la lista,
			 * pero el item insertado es localizable sólo cuando se arrastra
			 * desde la misma lista. Por lo tanto, div_set tendrá contenido sólo
			 * si el elemento arrastrado procede de la misma lista.
			 * 
			 * Para la lista de elementos de PBX, se debe buscar la posición
			 * adecuada en la lista para el cambio de posición. Luego se cancela
			 * el movimiento por ratón, y se repite el movimiento a través de
			 * los controladores.
			 * 
			 * Si div_set.length es 0, entonces la actualización corresponde a
			 * un arrastre entre dos paneles, y esto se maneja en el evento
			 * receive().
			 */
			if (div_set.length > 0) {
				var controller = this.get('controller');
				
				// Véase comentario de orden de operaciones en receive()
				var dropped_id = ui.item.attr('data-idattr');
				var removepos = null;
				var insertpos = this.getInsertPos(div_set);

				removepos = controller.findIndexBy('idattr', dropped_id);

				this.get('ui').sortable('cancel');

				if (removepos == null) {
					console.error('BUG: failed to find extension for ' + dropped_id + ' in controller!');
					return;
				}
				
				// Se repite el cambio de posición a través del controlador.
				this.moveExtension(controller, removepos, controller, insertpos);
			}
		},
		receive: function (event, ui) {
			var dropped_id = ui.item.attr('data-idattr');
			var dstController = this.get('controller');			

			// Localizar el DesktopController
			var parentController = dstController.get('parentcontroller');
			
			// Localizar la extensión que debe de quitarse
			var r = parentController.localizarControladorExtension('idattr', dropped_id);
			var srcController = null;
			if (r != null) {
				srcController = r[0];
				var removepos = r[1];
			}
			if (srcController == null) {
				console.error('BUG: failed to fetch srcController for extension!');
				ui.sender.sortable('cancel'); return;
			}
			
			/* El orden de operaciones es importante. Primero hay que calcular
			 * las posiciones fuente y destino de la extensión a mover, SIN
			 * MODIFICAR LOS CONTROLADORES. Luego de aprobar el movimiento
			 * de la extensión, y sabiendo la posición de inserción, se cancela
			 * el drag, y a continuación se modifican los controladores para
			 * que estos sean los que modifiquen el UI. 
			 */

			// Agregar la extensión en la posición indicada por el drop
			var insertpos = this.getInsertPos(ui.item);
			
			ui.sender.sortable('cancel');
			var extension = this.moveExtension(srcController, removepos, dstController, insertpos);
			extension.set('current_area', dstController.get('name'));
		},
		moveExtension: function(srcController, removepos, dstController, insertpos) {
			var extension = srcController.objectAt(removepos);
			srcController.removeAt(removepos);
			if (insertpos != null) {
				if (srcController == dstController && removepos < insertpos) {
					insertpos--;
				}
				dstController.insertAt(insertpos, extension);
			} else {
				dstController.addObject(extension);
			}
			return extension;
		}
	});

	// La siguiente vista contiene elementos que se reordenan
	App.BaseSortableView = Ember.View.extend(JQ.Widget, {
		uiType: ['sortable'],
		//tagName: 'ul',
		classNames: ['lisortable'],
		uiOptions: ['opacity', 'cursor'],
		cursor: 'move'
	});
	
	// La siguiente vista tiene además de reordenamiento, aplicado jquery.faq
	App.FAQView = App.BaseSortableView.extend({
		tagName: 'dl',
		didInsertElement: function () {
			var ui = this.$();
			ui.faq();
		}
	});
	
	/* La siguiente vista es la vista base que se usa para representar una 
	 * extensión. En esta vista, y en todas las otras vistas que representan
	 * un solo element, el valor de context es la extensión/cola/otro elemento.
	 */
	App.PBXElementView = Ember.View.extend({
		classNames: ['pbxelement'],
		classNameBindings: ['context.registered:pbxactive'],
		attributeBindings: ['dataIdattr:data-idattr'],
		dataIdattr: function() {
			return this.get('context.idattr');
		}.property('context.idattr'),
		truncatedDescription: function() {
			var s = this.get('context.description');
			if (s.length <= 15) return s;
			return s.substr(0, 15) + '...';
		}.property('context.description')
	});
	App.ExtensionView = App.PBXElementView.extend({
		classNames: ['ExtensionStyle'],
		templateName: 'extension',
		click: function(event) {
    // Obtener los atributos de la vista
    const attributes = event.currentTarget.attributes;
    // Llamar a la función selectExtension con los atributos
    const monitorElements = event.target.querySelectorAll('.monitor');
    const titleData = {};
    
	    // Itera sobre los elementos encontrados y agrega los valores al objeto
	    monitorElements.forEach(function(monitorElement, index) {
      // Obtiene el valor del atributo 'title' de cada elemento
      const title = monitorElement.getAttribute('title');
      // Asigna el valor al objeto usando un nombre de propiedad basado en el índice
      titleData[`title${index + 1}`] = title;
    });
    // Muestra el objeto con los valores en la consola
    selectExtension(attributes, titleData);
	},
		// Elegir un icono de telefono según el estado de la extensión
		extensionIcon: function() {
			var st = this.get('context.trunkstate');
			var iconpath = 'modules/' + module_name + '/images/';
			if (st == 'Up')
				return iconpath + 'icon_upPhone.png';
			else if (st == 'Ringing')
				return iconpath + 'phoneRinging.png';
			else
				return iconpath + 'phhonez0.png';
		}.property('context.trunkstate')
	});
	// Queue card: own styling (.q-card), not the fixed-size .pbxelement tile
	App.QueueView = Ember.View.extend({
		classNames: ['q-card'],
		templateName: 'queue',
		attributeBindings: ['dataIdattr:data-idattr'],
		dataIdattr: function() {
			return this.get('context.idattr');
		}.property('context.idattr'),
		truncatedDescription: function() {
			var s = this.get('context.description') || '';
			if (s.length <= 28) return s;
			return s.substr(0, 28) + '...';
		}.property('context.description'),

		// Queue KPIs (from QueueParams; Holdtime/TalkTime are Asterisk's
		// running averages since the last statistics reset)
		answered: function() {
			var v = this.get('context.Completed');
			return v == null ? '–' : v;
		}.property('context.Completed'),
		abandoned: function() {
			var v = this.get('context.Abandoned');
			return v == null ? '–' : v;
		}.property('context.Abandoned'),
		abandonRate: function() {
			var c = +this.get('context.Completed') || 0, a = +this.get('context.Abandoned') || 0;
			return (c + a) > 0 ? Math.round(a * 100 / (c + a)) : null;
		}.property('context.Completed', 'context.Abandoned'),
		abandonRateText: function() {
			var r = this.get('abandonRate');
			return r == null ? '–' : r + '%';
		}.property('abandonRate'),
		abandonRateClass: function() {
			var r = this.get('abandonRate');
			if (r == null) return '';
			return r <= 5 ? 'is-good' : (r <= 15 ? 'is-warn' : 'is-bad');
		}.property('abandonRate'),
		// SLA and averages mean nothing until the queue has handled a call
		hasCalls: function() {
			return ((+this.get('context.Completed') || 0) + (+this.get('context.Abandoned') || 0)) > 0;
		}.property('context.Completed', 'context.Abandoned'),
		slaText: function() {
			var v = this.get('context.ServiceLevelPerf');
			return (v == null || !this.get('hasCalls')) ? '–' : v + '%';
		}.property('context.ServiceLevelPerf', 'hasCalls'),
		slaLabel: function() {
			var sl = this.get('context.ServiceLevel');
			return 'SLA' + (sl ? ' ≤ ' + sl + ' ' + tr('LBL_SEC', 's') : '');
		}.property('context.ServiceLevel'),
		slaClass: function() {
			var v = this.get('context.ServiceLevelPerf');
			if (v == null || !this.get('hasCalls')) return '';
			return v >= 80 ? 'is-good' : (v >= 60 ? 'is-warn' : 'is-bad');
		}.property('context.ServiceLevelPerf', 'hasCalls'),
		avgWait: function() {
			return this.get('hasCalls') ? formatDuration(this.get('context.Holdtime')) : '–';
		}.property('context.Holdtime', 'hasCalls'),
		avgTalk: function() {
			return this.get('hasCalls') ? formatDuration(this.get('context.TalkTime')) : '–';
		}.property('context.TalkTime', 'hasCalls'),

		// The caller waiting longest right now
		longestWaitSec: function() {
			var now = App.ticks.get('tick500'), max = null;
			(this.get('context.callers') || []).forEach(function(caller) {
				var since = callerSince(caller);
				if (since) max = Math.max(max || 0, (now - since * 1000) / 1000);
			});
			return max;
		}.property('context.callers.@each', 'App.ticks.tick500'),
		longestWait: function() {
			var s = this.get('longestWaitSec');
			return s == null ? '–' : formatDuration(s);
		}.property('longestWaitSec'),
		longestWaitClass: function() {
			var level = waitLevel(this.get('longestWaitSec') || 0);
			return level ? 'is-' + level : '';
		}.property('longestWaitSec')
	});
	// A caller waiting in a queue, with a live wait timer that turns
	// yellow/red after WAIT_WARN_SEC / WAIT_ALERT_SEC
	App.QueueCallerView = Ember.View.extend({
		classNames: ['q-caller'],
		classNameBindings: ['waitClass'],
		templateName: 'queue-caller',
		waitSec: function() {
			var since = callerSince(this.get('context'));
			if (since == null) return null;
			return (App.ticks.get('tick500') - since * 1000) / 1000;
		}.property('context.QueueSince', 'context.Since', 'App.ticks.tick500'),
		formatWait: function() {
			var s = this.get('waitSec');
			return s == null ? '' : formatDuration(s);
		}.property('waitSec'),
		waitClass: function() {
			var level = waitLevel(this.get('waitSec') || 0);
			return level ? 'is-' + level : '';
		}.property('waitSec')
	});
	App.ConferenceView = App.PBXElementView.extend({
		classNames: ['pbxelement', 'pbxactive'],
		templateName: 'conference'
	});
	App.ParkinglotView = App.PBXElementView.extend({
		classNames: ['pbxelement', 'pbxactive'],
		templateName: 'parkinglot'
	});
	App.IPTrunkView = App.PBXElementView.extend({
		templateName: 'iptrunk'
	});
	App.DAHDISpanView = App.PBXElementView.extend({
		classNames: ['pbxelement', 'pbxactive'],
		templateName: 'dahdispan'
	});
	
	/* La siguiente vista representa un icono que puede recibir un teléfono
	 * arrastrado para realizar una llamada hacia la extensión que posee la
	 * vista. */
	App.DroppableIconView = Ember.View.extend(JQ.Widget, {
		uiType:				['droppable'],
		uiEvents:			['drop'],
		tagName:			'img',
		classNames:			['icon'],
		attributeBindings:	['icon:src'],
		icon: null,	// <-- seteado en la plantilla con cada icono requerido
		
		drop: function(event, ui) {
			if (ui == null) return;

			var targetExtension = this.get('context');
			var dropped_id = ui.draggable.parents('.pbxelement').attr('data-idattr');

			var dstController = this.get('controller');			

			// Localizar el DesktopController
			var parentController = dstController.get('parentcontroller');
			
			// Localizar el controlador que provee la extensión
			var r = parentController.localizarControladorExtension('idattr', dropped_id);
			var srcController = r[0];
			var extpos = r[1];
			if (srcController == null) {
				console.error('BUG: failed to fetch srcController for extension!');
				return;
			}
			var sourceExtension = srcController.objectAt(extpos);

			$.post('index.php?menu=' + module_name + '&rawmode=yes', {
				menu:		module_name, 
				rawmode:	'yes',
				action:		'callExtension',
				source:		sourceExtension.get('extension'),
				target:		targetExtension.get('extension')
			},
			function(respuesta) {
				verificar_error_session(respuesta);
				/*
				if (respuesta.status == 'error') {
					mostrar_mensaje_error(respuesta.message);
				}
				*/
				console.debug(respuesta);
			}.bind(this), 'json');
		}
	});
	
	/* La siguiente vista representa un icono de teléfono que puede ser 
	 * arrastrado además de recibir arrastres. */
	App.DraggablePhoneIconView = App.DroppableIconView.extend({
		uiType:		['droppable', 'draggable'],
		uiOptions:	['revert', 'cursor', 'zIndex'],
		revert:		true,
		cursor:		'crosshair',
		zIndex:		990,
		
		doubleClick: function (event) {
			var targetExtension = this.get('context');
			$.post('index.php?menu=' + module_name + '&rawmode=yes', {
				menu:		module_name, 
				rawmode:	'yes',
				//action:		'hangupExtension',
				target:		targetExtension.get('extension')

			},
			function(respuesta) {
				verificar_error_session(respuesta);
				if (respuesta.status == 'error') {
					alert(respuesta.message);
				}
			}.bind(this), 'json');
		}
	});
	
	/* El siguiente controlador es el controlador de más alto nivel. Este 
	 * controlador modela el escritorio que se muestra en la pantalla. El 
	 * escritorio contiene paneles (PBXPanelController) que a su vez contienen 
	 * objetos que se actualizan. Este controlador administra las llamadas
	 * AJAX que actualizan en tiempo real los objetos. */
	App.DesktopController = Ember.ObjectController.extend({
		// Los siguientes controladores son las áreas a mostrar
		extensions:			null,
		area1: 				null,
		area2: 				null,
		area3: 				null,
		queues:				null,
		dahdi:				null,
		iptrunks: 			null,
		conferences:		null,
		parkinglots:		null,
		longPoll:			null,	// Objeto de POST largo
		estadoClienteHash: 	var_init['ESTADO_CLIENTE_HASH'],	// Hash del estado del cliente
		connected:			false,
		registeredCount:	'–',	// Extensions online, computed from each snapshot
		unregisteredCount:	'–',	// Extensions offline
		reconnectTimer: null,
		stopping: false,

		init: function() {
			for (var k in var_init['ESTADO_PANELES']) {
				var_init['ESTADO_PANELES'][k]['parentcontroller'] = this;
			}
			var_init['ESTADO_PANELES']['Extension']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area1']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area2']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area3']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area4']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area5']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area6']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area7']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area8']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Area9']['typedclass'] = App.Extension;
			var_init['ESTADO_PANELES']['Queues']['typedclass'] = App.Queue;
			var_init['ESTADO_PANELES']['Conferences']['typedclass'] = App.Conference;
			var_init['ESTADO_PANELES']['Parkinglots']['typedclass'] = App.Parkinglot;
			var_init['ESTADO_PANELES']['TrunksSIP']['typedclass'] = App.IPTrunk;
			var_init['ESTADO_PANELES']['Trunks']['typedclass'] = App.DAHDISpan;
			
			this.extensions = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Extension']);
			this.area1 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area1']);
			this.area2 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area2']);
			this.area3 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area3']);
			this.area4 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area4']);
			this.area5 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area5']);
			this.area6 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area6']);
			this.area7 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area7']);
			this.area8 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area8']);
			this.area9 = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Area9']);
			this.queues = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Queues']);
			this.conferences = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Conferences']);
			this.parkinglots = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Parkinglots']);
			this.dahdi = App.PBXPanelController.create(var_init['ESTADO_PANELES']['Trunks']);
			this.iptrunks = App.PBXPanelController.create(var_init['ESTADO_PANELES']['TrunksSIP']);
			
			setTimeout(this.pbxStatus.bind(this), 1);
			$(window).unload(this.pbxStatus_shutdown.bind(this));
			
			// Esta variable puede usarse para localizar el resto de objetos en debug
			debug_root = this;
		},
		
        pbxStatus: function() {
            if (this.stopping || this.longPoll != null) return;
            var started = Date.now();
            var succeeded = false;
            var request = $.ajax({
                url: 'index.php',
                data: {menu: module_name, rawmode: 'yes', action: 'pbxSnapshot'},
                dataType: 'json',
                cache: false,
                timeout: 7000
            });
            this.longPoll = request;
            request.done(function(response) {
                if (this.stopping) return;
                verificar_error_session(response);
                if (response.error || !response.snapshot || !Array.isArray(response.pbxchanges)) {
                    this.set('connected', false);
                    return;
                }
                this.manejarRespuestaSnapshot(response);
                succeeded = true;
                this.set('connected', true);
            }.bind(this));
            request.fail(function() {
                this.set('connected', false);
            }.bind(this));
            request.always(function() {
                this.longPoll = null;
                if (!this.stopping) {
                    var delay = succeeded ? Math.max(0, 1000 - (Date.now() - started)) : 3000;
                    this.reconnectTimer = setTimeout(this.pbxStatus.bind(this), delay);
                }
            }.bind(this));
        },

        pbxStatus_shutdown: function() {
            this.stopping = true;
            clearTimeout(this.reconnectTimer);
            if (this.longPoll != null) this.longPoll.abort();
            this.longPoll = null;
        },

        manejarRespuestaSnapshot: function(response) {
            var previous = this.snapshotIndex || Object.create(null);
            var next = Object.create(null);
            var changes = [];
            var online = 0, offline = 0;
            var callSince = Object.create(null);
            response.pbxchanges.forEach(function(obj) {
                if (obj.objtype === 'phones') {
                    if (obj.registered) online++; else offline++;
                    // Start of the oldest active channel: used for the
                    // "in call" / "ringing" timer of queue agents
                    (obj.active || []).forEach(function(call) {
                        var since = call ? +call.Since : 0;
                        if (since > 0 && (!callSince[obj.extension] || since < callSince[obj.extension]))
                            callSince[obj.extension] = since;
                    });
                }
                var key = obj.objtype === 'phones' || obj.objtype === 'iptrunks' ? obj.channel :
                    (obj.objtype === 'dahdi' ? obj.span : obj.extension);
                var id = obj.objtype + ':' + key;
                var signature = JSON.stringify(obj);
                next[id] = {signature: signature, objtype: obj.objtype, key: key};
                if (!previous[id] || previous[id].signature !== signature) {
                    obj.changetype = previous[id] ? 'update' : 'create';
                    changes.push(obj);
                }
            });
            Object.keys(previous).forEach(function(id) {
                if (!next[id]) changes.push({objtype: previous[id].objtype, key: previous[id].key, changetype: 'delete'});
            });
            phoneCallSince = callSince;     // before the queue agent rows are rebuilt
            this.manejarRespuestaStatus({timestamp: response.timestamp, pbxchanges: changes});
            this.snapshotIndex = next;
            this.setProperties({registeredCount: online, unregisteredCount: offline});
        },

		localizarControladorExtension: function(key, value) {
			var controller = null;
			var objpos = null;
			var controllerList = ['extensions', 'area1', 'area2', 'area3', 'area4', 'area5', 'area6', 'area7', 'area8', 'area9'];
			for (var i = 0; i < controllerList.length; i++) {
				var c = this.get(controllerList[i]);
				if (c == null) return null;
				objpos = c.findIndexBy(key, value);
				if (objpos != null) {
					controller = c;
					break;
				}
			}
			return (objpos != null) ? [controller, objpos] : null;
		},
		
		manejarRespuestaStatus: function(respuesta) {
			//console.debug(respuesta);

			// Intentar recargar la página en caso de error
			if (respuesta.error != null) {
				window.alert(respuesta.error);
				location.reload();
				return false;
			}

			if (respuesta.timestamp != null) {
				App.ticks.initTick(respuesta.timestamp);
			}
			
			if (respuesta.estadoClienteHash == 'mismatch') {
				/* Ha ocurrido un error y se ha perdido sincronía. Si el hash que 
				 * recibió es distinto a estadoClienteHash entonces esta es una petición
				 * vieja. Si es idéntico debe de recargase la página.
				 */
				/*
				if (respuesta.hashRecibido == this.get('estadoClienteHash')) {
					// Realmente se ha perdido sincronía
					//console.error("Lost synchronization with server, reloading page...");
					location.reload();
				} else {
					// Se ha recibido respuesta luego de que supuestamente se ha parado
					//console.warn("Received mismatch from stale SSE session, ignoring...");
				}
				*/
				location.reload();
				return false;
			}
			this.set('estadoClienteHash', respuesta.estadoClienteHash);
			
			var initialQueues = [];
			// Manejar cada objeto a medida que llega.
			for (var i = 0; i < respuesta.pbxchanges.length; i++) {
				//console.log(respuesta);
				var obj = respuesta.pbxchanges[i];
				switch (obj.changetype) {
				case 'create':
					if (obj.objtype === 'queues') initialQueues.push(obj);
					this.insertPBXObject(obj);
					break;
				case 'update':
                    if (obj.objtype === 'queues') initialQueues.push(obj);
					this.updatePBXObject(obj);
					break;
				case 'delete':
					this.deletePBXObject(obj);
					break;
				default:
					console.debug('Unimplemented changetype: ' + obj.changetype);
					break;
				}
			}
			
			if (initialQueues.length) Ember.run.scheduleOnce('afterRender', null, function() {
                renderInitialQueues(initialQueues);
            });

			// Indicar a todos los controladores que se terminó la carga
			var controlkeys = ['extensions', 'area1', 'area2', 'area3', 'area4', 'area5', 'area6', 'area7', 'area8', 'area9','queues',
			                   'conferences', 'parkinglots', 'dahdi', 'iptrunks'];
			for (var i = 0; i < controlkeys.length; i++) {
				this.get(controlkeys[i]).set('finishedloading', true);
			}
			
			return true;
		},
		
		locateTargetController: function (obj) {
			var controller;
			
			switch (obj.objtype) {
			case 'phones':
				controller = this.get('extensions');
				switch (obj.current_area) {
				case 'Area1': controller = this.get('area1'); break;
				case 'Area2': controller = this.get('area2'); break;
				case 'Area3': controller = this.get('area3'); break;
				case 'Area4': controller = this.get('area4'); break;
				case 'Area5': controller = this.get('area5'); break;
				case 'Area6': controller = this.get('area6'); break;
				case 'Area7': controller = this.get('area7'); break;
				case 'Area8': controller = this.get('area8'); break;
				case 'Area9': controller = this.get('area9'); break;
				}
				break;
			case 'conferences':
			case 'parkinglots':
			case 'queues':
			case 'iptrunks':
			case 'dahdi':
				controller = this.get(obj.objtype); break;
			default:
				console.debug('Unimplemented type: ' + obj.objtype)
				return null;
			}
			return controller;
		},
		
		insertPBXObject: function(obj) {
		  var controller = this.locateTargetController(obj);
		  if (controller != null) controller.addTypedObject(obj);
          if (obj.objtype === 'queues') refreshAgents(obj.memberRefresh, obj.extension);
		},
		
		updatePBXObject: function(obj) {
			var dstController = this.locateTargetController(obj);
			var pbxobject;
			//console.log(obj);
			switch (obj.objtype) {
			case 'phones':
				var r = this.localizarControladorExtension('channel', obj.channel);
				var srcController = r[0];
				var extpos = r[1];
				if (srcController == null) {
					console.error('BUG: failed to fetch srcController for extension!');
					return;
				}
				pbxobject = srcController.objectAt(extpos);
				if (pbxobject.get('current_area') != obj.current_area) {
					// Cambiar de área el objeto
					srcController.removeAt(extpos);
					dstController.addTypedObject(obj);
					return;
				}
				break;
			case 'conferences':
			case 'parkinglots':
			case 'queues':
				var f = dstController.filterBy('extension', obj.extension);
				if (f.length > 0) pbxobject = f[0];
				break;
			case 'iptrunks':
				var f = dstController.filterBy('channel', obj.channel);
				if (f.length > 0) pbxobject = f[0];
				break;
			case 'dahdi':
				var f = dstController.filterBy('span', obj.span);
				if (f.length > 0) pbxobject = f[0];
				break;
			default:
				console.debug('Unimplemented type: ' + obj.objtype)
				break;
			}
			if (pbxobject != null) {
				for (var k in obj) switch (k) {	
				case 'collectionChanges':
					applyCallCollectionChanges(pbxobject, obj[k]);
					break;
				case 'memberRefresh':
					refreshAgents(obj.memberRefresh, obj.extension);
					pbxobject.set(k, obj[k]);
					break;
				case 'members':	// para colas
					//pbxobject.setMembers(obj[k]);
					break;
				case 'active':	// para extensiones
					pbxobject.setActive(obj[k]);
					break;
				case 'chan':	// para líneas DAHDI
					pbxobject.setChan(obj[k]);
					break;
				default:
					pbxobject.set(k, obj[k]);
					break;
				}
			} else {
				console.debug('Could not locate controller or object for:');
				console.debug(obj);
			}
		},
		
        deletePBXObject: function(obj) {
            if (obj.objtype === 'phones') {
                var found = this.localizarControladorExtension('channel', obj.key);
                if (found) found[0].removeAt(found[1]);
                return;
            }
            var controller = this.get(obj.objtype);
            if (!controller) return;
            var field = obj.objtype === 'iptrunks' ? 'channel' : (obj.objtype === 'dahdi' ? 'span' : 'extension');
            var index = controller.findIndexBy(field, obj.key);
            if (index != null) controller.removeAt(index);
            if (obj.objtype === 'queues') delete queueMemberStates[obj.key];
        },
		
		// Mandar a actualizar al servidor el tamaño del panel
		updatePanelSize: function(sourcePanel, width, height) {
			var leftPanels = ['Extension', 'TrunksSIP', 'Trunks'];
			var rightPanels = ['Area1', 'Area2', 'Area3', 'Area4', 'Area5', 'Area6', 'Area7', 'Area8', 'Area9', 'Queues', 'Conferences', 'Parkinglots'];
			

			var panelGroups = {
				'left': [this.extensions, this.iptrunks, this.dahdi],
				'right': [this.area1, this.area2, this.area3, this.queues, this.conferences, this.parkinglots]
			};
			var pgroup = null;

			for (var k in panelGroups) {
				if (panelGroups[k].findBy('name', sourcePanel) != null)
					pgroup = k;
			}
			if (pgroup == null) return;
			
			for (var i = 0; i < panelGroups[pgroup].length; i++) {
				panelGroups[pgroup][i].set('width', width);
			}
			$.post('index.php?menu=' + module_name + '&rawmode=yes', {
				menu:			module_name, 
				rawmode:		'yes',
				action:			'updatePanelSize',
				width:			width,
				panelgroup:		pgroup
			},
			function(respuesta) {
				verificar_error_session(respuesta);
				if (respuesta.status == 'error') {
					alert(respuesta.message);
				}
			}.bind(this), 'json');
		}

	});
	
	App.Router.map(function() {
		this.resource('desktop', { path: '/' }, function () {
			/*
			this.route('getconfiglog');
			this.route('endpointconfig', { path: '/endpointconfig/:id_endpoint' });
			*/
		});
	});
	
	App.DesktopRoute = Ember.Route.extend({
		/*
		setupController: function(controller, model) {
			controller.loadModels();
		}
		*/
	});
});



function initializeJQueryUIViews()
{
	// Put jQuery UI inside its own namespace
	JQ = {};

	// Create a new mixin for jQuery UI widgets using the Ember
	// mixin syntax.
	JQ.Widget = Em.Mixin.create({
	  // When Ember creates the view's DOM element, it will call this
	  // method.
	  didInsertElement: function() {
		// Make jQuery UI options available as Ember properties
	    var options = this._gatherOptions();

	    // Make sure that jQuery UI events trigger methods on this view.
	    this._gatherEvents(options);

	    // Create a new instance of the jQuery UI widget based on its `uiType`
	    // and the current element.
	    //var ui = jQuery.ui[this.get('uiType')](options, this.get('element'));
	    var uiType = this.get('uiType');
	    var ui = this.$();
	    if (typeof uiType == 'object') {
	    	for (var i = 0; i < uiType.length; i++)
	    		ui = ui[uiType[i]](options);
	    } else {
	    	//ui = this.$()[uiType](options);
	    	ui = ui[uiType](options);
	    }

	    // Save off the instance of the jQuery UI widget as the `ui` property
	    // on this Ember view.
	    this.set('ui', ui);
	  },

	  // When Ember tears down the view's DOM element, it will call
	  // this method.
	  willDestroyElement: function() {
		var ui = this.get('ui');
	    if (ui) {
	      // Tear down any observers that were created to make jQuery UI
	      // options available as Ember properties.
	      var observers = this._observers;
	      for (var prop in observers) {
	        if (observers.hasOwnProperty(prop)) {
	          this.removeObserver(prop, observers[prop]);
	        }
	      }
	      //ui._destroy();
		  var uiType = this.get('uiType');
          if (typeof uiType == 'object') {
		  	for (var i = 0; i < uiType.length; i++)
		  		ui = ui[uiType[i]]('destroy');
		  } else {
			  ui = ui[uiType]('destroy');
		  }
	    }
	  },

	  // Each jQuery UI widget has a series of options that can be configured.
	  // For instance, to disable a button, you call
	  // `button.options('disabled', true)` in jQuery UI. To make this compatible
	  // with Ember bindings, any time the Ember property for a
	  // given jQuery UI option changes, we update the jQuery UI widget.
	  _gatherOptions: function() {
	    var uiOptions = this.get('uiOptions'), options = {};

	    // The view can specify a list of jQuery UI options that should be treated
	    // as Ember properties.
	    if (uiOptions != null) uiOptions.forEach(function(key) {
	      options[key] = this.get(key);

	      // Set up an observer on the Ember property. When it changes,
	      // call jQuery UI's `setOption` method to reflect the property onto
	      // the jQuery UI widget.
	      var observer = function() {
	        var value = this.get(key);
	        var uiType = this.get('uiType');
	        this.get('ui')[uiType]('option', key, value);
	        //this.get('ui')._setOption(key, value);
	      };

	      this.addObserver(key, observer);

	      // Insert the observer in a Hash so we can remove it later.
	      this._observers = this._observers || {};
	      this._observers[key] = observer;
	    }, this);

	    return options;
	  },

	  // Each jQuery UI widget has a number of custom events that they can
	  // trigger. For instance, the progressbar widget triggers a `complete`
	  // event when the progress bar finishes. Make these events behave like
	  // normal Ember events. For instance, a subclass of JQ.ProgressBar
	  // could implement the `complete` method to be notified when the jQuery
	  // UI widget triggered the event.
	  _gatherEvents: function(options) {
	    var uiEvents = this.get('uiEvents') || [], self = this;

	    uiEvents.forEach(function(event) {
	      var callback = self[event];

	      if (callback) {
	        // You can register a handler for a jQuery UI event by passing
	        // it in along with the creation options. Update the options hash
	        // to include any event callbacks.
	        options[event] = function(event, ui) { return callback.call(self, event, ui); };
	      }
	    });
	  }
	});
	/*
	// Create a new Ember view for the jQuery UI Button widget
	JQ.Button = Em.View.extend(JQ.Widget, {
	  uiType: 'button',
	  uiOptions: ['label', 'disabled'],

	  tagName: 'button'
	});
	
	// Create a new Ember view for the jQuery UI Buttonset widget
	JQ.ButtonSet = Em.View.extend(JQ.Widget, {
	  uiType: 'buttonset'
	  //uiOptions: ['label', 'disabled']
	});
	// Create a new Ember view for the jQuery UI Progress Bar widget
	JQ.ProgressBar = Em.View.extend(JQ.Widget, {
	  uiType: 'progressbar',
	  uiOptions: ['value', 'max'],
	  uiEvents: ['change', 'complete']
	});
	*/
}




function formatoMilisegundo(msec)
{
	var tiempo = [0, 0, 0];
	tiempo[0] = (msec - (msec % 1000)) / 1000;
	tiempo[1] = (tiempo[0] - (tiempo[0] % 60)) / 60;
	tiempo[0] %= 60;
	tiempo[2] = (tiempo[1] - (tiempo[1] % 60)) / 60;
	tiempo[1] %= 60;
	var i = 0;
	for (i = 0; i < 3; i++) { if (tiempo[i] <= 9) tiempo[i] = "0" + tiempo[i]; }
	return tiempo[2] + ':' + tiempo[1] + ':' + tiempo[0];
}


//////////////////////////////////////////// BUTTONS CONTROL ////////////////////////////////////////////////////////////////////////////

var selectedContainer = null;
var selectedExtension = null;
var selectedTech 			= null;
var line1							= null;
var line2							= null;

function selectExtension(element, titleData) {
		//console.log(element);

    var idContainer = element[0].nodeValue;
    var classAttribute = element[1];
    var dataIdAttrAttribute = element[2];

    // Verifica si el contenedor tiene la clase 'pbxactive'
    var hasPbxActiveClass = classAttribute.value.includes('pbxactive');

    // Al principio, mantén las variables locales
    var localTech 			= null;
    var localExtension 	= null;
    var channel1 				= null;
    var channel2				= null;

    // Si se hace clic en el mismo contenedor, desmarca
    if (selectedContainer && selectedContainer.id === idContainer) {
        selectedContainer.style.border = ""; // Desmarca el contenedor
        selectedContainer = null;
        selectedTech 			= null;
        selectedExtension = null;
        line1							= null;
        line2							= null;

        return;
    }

    // Obtener datos del contenedor si tiene la clase 'pbxactive'
    if (hasPbxActiveClass) {
        // Obtener el valor del atributo "data-idattr"
        if (dataIdAttrAttribute) {
            var dataIdAttrValue = dataIdAttrAttribute.value;

            // Dividir el valor en "tech" y "extension"
            var parts = dataIdAttrValue.split('/');
            if (parts.length === 2) {
                localTech = parts[0]; // Mantén las variables locales
                localExtension = parts[1].replace(/"/g, ''); // Mantén las variables locales
            }

            if (titleData.title1) {
						    const regexPattern = new RegExp(localTech + '/' + localExtension + '-([\\w-]+)');
						    
						    for (const key in titleData) {
						        if (titleData.hasOwnProperty(key)) {
						            const match = titleData[key].match(regexPattern);
						            if (match) {
						                if (!channel1) {
						                    channel1 = match[0];
						                } else if (!channel2) {
						                    channel2 = match[0];
						                    break; // Salir del bucle después de encontrar el segundo valor
						                }
						            }
						        }
						    }
						}
						// Mostrar los valores de line1 y line2 en la consola
						//console.log("line1:", channel1);
						//console.log("line2:", channel2);
        }
    } else {
    	if (selectedContainer){
    	selectedContainer.style.border = ""; // Desmarca el contenedor
    	}
        selectedContainer = null;
        selectedTech 			= null;
        selectedExtension = null;
        line1							= null;
        line2							= null;

    }

    // Desmarca el contenedor previamente seleccionado
    if (selectedContainer) {
        selectedContainer.style.border = "";
    }

    // Actualiza las variables globales con las locales
    selectedTech 			= localTech;
    selectedExtension = localExtension;
    line1							= channel1;
    line2							= channel2;

    // Marca el nuevo contenedor si tiene la clase 'pbxactive'
    if (hasPbxActiveClass) {
        var containerExtension = document.getElementById(idContainer);
        if (containerExtension) {
            containerExtension.style.border = "2px solid #003bec";
            selectedContainer = containerExtension;
        }
    }
}


document.addEventListener("click", function(event) {
  setTimeout(function() {
    if (selectedContainer && !event.target.closest(".ExtensionStyle")) {
      selectedContainer.style.border = ""; // Desmarca el contenedor cuando se hace clic en cualquier otro lugar del documento
      selectedContainer = null;
      selectedTech 			= null;
			selectedExtension = null;
			line1							= null;
			line2							= null;
    }
  }, 0);
});




////////////////////////////////////////////AGENTS CONTROL STATUS ////////////////////////////////////////////////////////////////////////////


// The first AMI snapshot already includes members and queue statistics.
// Render it directly instead of making a second QueueStatus request.
function renderInitialQueues(queues) {
    // Incomplete data cannot be rendered; the next snapshot will bring it.
    queues = queues.filter(function(queue) {
        return queue.memberRefresh && queue.Completed != null && queue.Abandoned != null;
    });
    if (!queues.length) return;
    actualizarUI(queues.map(function(queue) {
        var members = queue.memberRefresh.map(function(member) {
            var location = member.Interface || '';
            return {
                Name: member.MemberName,
                Location: location.substring(location.indexOf('/') + 1).split('@')[0],
                Status: member.Status,
                Paused: member.Paused,
                PausedReason: member.PausedReason,
                CallsTaken: member.CallsTaken,
                LastCall: member.LastCall,
                LastPause: member.LastPause
            };
        });
        members.sort(function(a, b) { return parseInt(a.Location, 10) - parseInt(b.Location, 10); });
        return {Queue: String(queue.extension), Completed: queue.Completed, Abandoned: queue.Abandoned, Members: members};
    }));
}

// Translated UI string from arrLang_main (filled by index.php via _tr()).
function tr(key, fallback) {
    return (typeof arrLang_main !== 'undefined' && arrLang_main[key]) ? arrLang_main[key] : fallback;
}

// Queue statistics are included in every one-second snapshot.

function actualizarUI(data) {
    // Fill the agent list of the queue cards rendered by the "queue" template.
    // Queue counters (answered, SLA, ...) are Ember bindings in App.QueueView.
    data.forEach(function(queueData) {
        var queueNumber = String(queueData.Queue).trim();
        var card = document.querySelector('[data-idattr="QUEUE/' + queueNumber + '"]');
        if (!card) return;

        var agentsDiv = card.querySelector('.Queue-Agents');
        if (agentsDiv && queueData.Members) {
            agentsDiv.innerHTML = queueData.Members.length
                ? queueData.Members.map(function(member) { return generateAgentHTML(member, queueNumber); }).join('')
                : '<div class="q-empty">' + escapeHtml(tr('LBL_NO_AGENTS', 'No agents')) + '</div>';
        }
        refreshAgents(queueMemberStates[queueNumber], queueNumber);
        finishAgentList(card);
    });
}

// Duration in seconds -> "m:ss" or "h:mm:ss"
function formatDuration(sec) {
    if (sec == null || isNaN(sec)) return '–';
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + ss;
    return m + ':' + ss;
}

// Server time in ms (App.ticks follows the PBX clock, not the browser clock).
function serverNow() {
    return (App && App.ticks && App.ticks.get('tick500')) || Date.now();
}

// Extension -> unix time (s) of its oldest active channel, rebuilt from every
// snapshot by manejarRespuestaSnapshot. QueueMember has no "in call since"
// field, so the phone's channel gives the start of a call or of the ringing.
var phoneCallSince = Object.create(null);

function isCallState(cls) {
    return cls === 'st-busy' || cls === 'st-ringing';
}

// When did an agent enter its current state? Tracked per queue and agent.
// In a call / ringing: start of the phone's channel. On first sight Asterisk
// hints are used (LastPause for a pause, LastCall for "free"); otherwise the
// time is unknown until the next state change.
var agentStateSince = Object.create(null);
function agentSince(queue, number, cls, member) {
    var key = queue + '/' + number;
    var prev = agentStateSince[key];
    if (isCallState(cls) && phoneCallSince[number]) {
        agentStateSince[key] = {cls: cls, since: phoneCallSince[number] * 1000};
        return agentStateSince[key].since;
    }
    if (prev && prev.cls === cls) return prev.since;
    var since = null;
    if (!prev) {
        if (cls === 'st-paused' && +member.LastPause > 0) since = member.LastPause * 1000;
        else if (cls === 'st-free' && +member.LastCall > 0) since = member.LastCall * 1000;
    } else {
        since = serverNow();
    }
    agentStateSince[key] = {cls: cls, since: since};
    return since;
}

// Inner HTML of one agent row: status dot, number, name, calls taken,
// status text with the time spent in that status.
function agentRowHTML(queue, number, name, member) {
    var st = memberStatus(member.Status, member.Paused);
    var label = st.label;
    if (st.cls === 'st-paused' && member.PausedReason) label += ' (' + member.PausedReason + ')';

    var html = '<span class="agent-dot ' + st.cls + '" title="' + escapeHtml(label) + '"></span>';
    if (number) html += '<span class="agent-num">' + escapeHtml(number) + '</span>';
    if (member.CallsTaken != null && member.CallsTaken !== '') {
        html += '<span class="agent-calls" title="' + escapeHtml(tr('LBL_CALLS_TAKEN', 'Calls taken')) + '">' +
            '<i class="fa fa-phone"></i>' + escapeHtml(member.CallsTaken) + '</span>';
    }
    html += '<span class="agent-name">' + escapeHtml(name) + '</span>';
    html += '<span class="agent-state ' + st.cls + '">' + escapeHtml(label);
    if (number && st.cls !== 'st-offline' && st.cls !== 'st-error') {
        var since = agentSince(queue, number, st.cls, member);
        if (since) {
            html += ' <span class="agent-timer" data-since="' + since + '" data-cls="' + st.cls +
                '" data-num="' + escapeHtml(number) + '">' +
                formatDuration((serverNow() - since) / 1000) + '</span>';
        }
    }
    html += '</span>';
    // Listening only makes sense during a call: in use, busy, on hold, or in
    // use and ringing for another call (the raw state, so also while paused)
    if (number && agentInCall(member)) {
        html += '<span class="agent-spy" title="' + escapeHtml(tr('LBL_SPY_BTN_TITLE', 'Listen to this agent')) +
            '" onclick="openSpyDialog(this)"><i class="fa fa-headphones"></i></span>';
    }
    return html;
}

function agentInCall(member) {
    return ['2', '3', '7', '8'].indexOf(String(member.Status)) !== -1;
}

function generateAgentHTML(member, queue) {
    // Local/ members have no plain extension number: show the full name only.
    var isLocal = String(member.Name).indexOf('Local/') !== -1;
    return '<div class="agent-container" data-member-number="' + escapeHtml(member.Location) + '">' +
        agentRowHTML(queue, isLocal ? '' : member.Location, member.Name, member) +
        '</div>';
}

// Queue member states are queue-specific (including pause state). Reapply the
// latest stream state after a slower statistics request rebuilds the agent DOM.
var queueMemberStates = Object.create(null);

function refreshAgents(members, queue) {
    if (!members || queue == null) return;
    queueMemberStates[queue] = members;
    var card = document.querySelector('[data-idattr="QUEUE/' + queue + '"]');
    if (!card) return;
    var agents = card.querySelectorAll('.agent-container');
    members.forEach(function(item) {
        var location = item.Interface || item.Location || '';
        var number = location.substring(location.indexOf('/') + 1).split('@')[0];
        if (!number) return;
        for (var j = 0; j < agents.length; j++) {
            if (agents[j].getAttribute('data-member-number') !== number) continue;
            agents[j].innerHTML = agentRowHTML(queue, number, item.MemberName, item);
        }
    });
    finishAgentList(card);
}

// Rows were (re)built: refresh timers / long pause and talk marks, then sort.
function finishAgentList(card) {
    updateAgentTimers(serverNow());
    var list = card.querySelector('.Queue-Agents');
    if (list) sortAgentRows(list);
}

//////////////////////////////// AGENT TIMERS, LONG PAUSE / TALK, SORTING ////////////////////////////////

// An agent row is marked (red timer) after this long in a pause / in a call.
var PAUSE_ALERT_SEC = 15 * 60;
var TALK_ALERT_SEC  = 10 * 60;

function updateAgentTimers(now) {
    var rows = document.querySelectorAll('.Queue-Agents .agent-container');
    for (var i = 0; i < rows.length; i++) {
        var t = rows[i].querySelector('.agent-timer[data-since]'), over = false;
        if (t) {
            var cls = t.getAttribute('data-cls'), num = t.getAttribute('data-num');
            if (isCallState(cls) && phoneCallSince[num]) t.setAttribute('data-since', phoneCallSince[num] * 1000);
            var sec = (now - t.getAttribute('data-since')) / 1000;
            var text = formatDuration(sec);
            if (t.textContent !== text) t.textContent = text;
            var limit = cls === 'st-paused' ? PAUSE_ALERT_SEC : (cls === 'st-busy' ? TALK_ALERT_SEC : 0);
            over = limit > 0 && sec >= limit;
        }
        $(rows[i]).toggleClass('is-over', over);
    }
}

// Sorting by state: free, ringing, in call, paused, then unavailable.
// The toggle in the "Agents" title switches back to sorting by number.
var AGENT_RANK = {'st-free': 0, 'st-ringing': 1, 'st-busy': 2, 'st-paused': 3, 'st-error': 4, 'st-offline': 5};
var agentSortOn = true;
try { agentSortOn = (window.localStorage.getItem('cp-agent-sort') !== '0'); } catch (e) {}

function compareAgentNumbers(a, b) {
    var na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a < b ? -1 : (a > b ? 1 : 0);
}

function sortAgentRows(list) {
    var rows = Array.prototype.slice.call(list.querySelectorAll('.agent-container'));
    if (rows.length < 2) return;
    var keyed = rows.map(function(row) {
        var dot = row.querySelector('.agent-dot');
        var cls = dot ? (dot.className.match(/st-[a-z]+/) || [''])[0] : '';
        return {
            row: row,
            rank: (agentSortOn && AGENT_RANK.hasOwnProperty(cls)) ? AGENT_RANK[cls] : 0,
            num: row.getAttribute('data-member-number') || ''
        };
    });
    keyed.sort(function(a, b) { return (a.rank - b.rank) || compareAgentNumbers(a.num, b.num); });
    var changed = keyed.some(function(k, i) { return k.row !== rows[i]; });
    if (changed) keyed.forEach(function(k) { list.appendChild(k.row); });
}

function toggleAgentSort() {
    agentSortOn = !agentSortOn;
    try { window.localStorage.setItem('cp-agent-sort', agentSortOn ? '1' : '0'); } catch (e) {}
    var lists = document.querySelectorAll('.Queue-Agents');
    for (var i = 0; i < lists.length; i++) sortAgentRows(lists[i]);
    updateSortButtons();
}

function updateSortButtons() {
    var title = tr(agentSortOn ? 'LBL_SORT_ON_TITLE' : 'LBL_SORT_OFF_TITLE', '');
    $('.q-sort').each(function() {
        $(this).toggleClass('is-on', agentSortOn);
        if (this.getAttribute('title') !== title) this.setAttribute('title', title);
    });
}

//////////////////////////////// WAIT ALARMS, TAB TITLE, LIVE TIMERS ////////////////////////////////

// A waiting caller is highlighted after WAIT_WARN_SEC and raises the alarm
// (red row, sound if enabled, blinking tab title) after WAIT_ALERT_SEC.
var WAIT_WARN_SEC  = 30;
var WAIT_ALERT_SEC = 60;

var waitAlarm = {
    baseTitle: null,
    alerted: Object.create(null),   // callers that already triggered the sound
    blink: false,
    audio: null,
    soundOn: false
};
try { waitAlarm.soundOn = (window.localStorage.getItem('cp-wait-sound') === '1'); } catch (e) {}

function waitLevel(seconds) {
    if (seconds >= WAIT_ALERT_SEC) return 'alert';
    if (seconds >= WAIT_WARN_SEC) return 'warn';
    return '';
}

function callerSince(caller) {
    return Ember.get(caller, 'QueueSince') || Ember.get(caller, 'Since');
}

// Short two-tone beep through Web Audio (no sound file needed).
function playWaitBeep() {
    if (!waitAlarm.soundOn) return;
    try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!waitAlarm.audio) waitAlarm.audio = new Ctx();
        var ctx = waitAlarm.audio;
        if (ctx.state === 'suspended') ctx.resume();
        [0, 0.25].forEach(function(offset, i) {
            var osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.value = i ? 660 : 880;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + 0.22);
        });
    } catch (e) {}
}

// Called from the bell button in the status bar (a click is required before
// browsers allow audio).
function toggleWaitSound() {
    waitAlarm.soundOn = !waitAlarm.soundOn;
    try { window.localStorage.setItem('cp-wait-sound', waitAlarm.soundOn ? '1' : '0'); } catch (e) {}
    if (waitAlarm.soundOn) playWaitBeep();
    updateSoundButton();
}

function updateSoundButton() {
    var btn = document.getElementById('cp-sound-toggle');
    if (!btn) return;
    var on = waitAlarm.soundOn;
    btn.className = 'cp-sound' + (on ? ' is-on' : '');
    btn.setAttribute('title', tr(on ? 'LBL_SOUND_ON_TITLE' : 'LBL_SOUND_OFF_TITLE', '')
        .replace('%s', WAIT_ALERT_SEC));
    var icon = btn.querySelector('.fa');
    if (icon) icon.className = 'fa ' + (on ? 'fa-bell' : 'fa-bell-slash');
}

// Runs every second: sound for new long waits, tab title, agent timers.
function checkWaitAlarms() {
    var ctrl = (typeof debug_root !== 'undefined') ? debug_root : null;
    if (waitAlarm.baseTitle == null) waitAlarm.baseTitle = document.title;
    var now = serverNow(), waiting = 0, alarm = false, seen = Object.create(null);

    if (ctrl && ctrl.get('queues')) {
        ctrl.get('queues').forEach(function(queue) {
            (queue.get('callers') || []).forEach(function(caller) {
                waiting++;
                var since = callerSince(caller);
                if (!since) return;
                var key = Ember.get(caller, 'Uniqueid') || Ember.get(caller, 'Channel');
                seen[key] = true;
                if ((now - since * 1000) / 1000 >= WAIT_ALERT_SEC) {
                    alarm = true;
                    if (!waitAlarm.alerted[key]) {
                        waitAlarm.alerted[key] = true;
                        playWaitBeep();
                        showWaitNotification(queue, caller, key);
                    }
                }
            });
        });
    }
    for (var k in waitAlarm.alerted) if (!seen[k]) delete waitAlarm.alerted[k];

    // Tab title: "(2) Call Monitoring", blinking while someone waits too long
    waitAlarm.blink = alarm && !waitAlarm.blink;
    var title = waitAlarm.baseTitle;
    if (waiting > 0) title = '(' + waiting + ') ' + title;
    if (waitAlarm.blink) title = '⚠ ' + title;
    if (document.title !== title) document.title = title;

    // Live "time in state" timers of the agents, long pause / talk marks
    updateAgentTimers(now);
    updateSoundButton();
    updateNotifyButton();
    updateSortButtons();
}
setInterval(checkWaitAlarms, 1000);

// Desktop (OS) notification for a long wait, shown only while the page is in
// the background. Browsers allow it on HTTPS only and after the user agrees.
var desktopNotify = {on: false};
try { desktopNotify.on = (window.localStorage.getItem('cp-notify') === '1'); } catch (e) {}

function notifySupported() {
    return ('Notification' in window) && window.isSecureContext !== false;
}

function notifyAllowed() {
    return desktopNotify.on && notifySupported() && Notification.permission === 'granted';
}

function setDesktopNotify(on) {
    desktopNotify.on = on;
    try { window.localStorage.setItem('cp-notify', on ? '1' : '0'); } catch (e) {}
    updateNotifyButton();
}

// Called from the "Notifications" button in the status bar.
function toggleDesktopNotify() {
    if (!notifySupported()) return;
    if (desktopNotify.on) { setDesktopNotify(false); return; }
    if (Notification.permission === 'granted') { setDesktopNotify(true); return; }
    if (Notification.permission === 'denied') {
        alert(tr('LBL_NOTIFY_DENIED', 'Notifications are blocked for this site in the browser settings.'));
        return;
    }
    var done = function(permission) { setDesktopNotify(permission === 'granted'); };
    var request = Notification.requestPermission(done);     // old browsers: callback
    if (request && request.then) request.then(done);        // new browsers: promise
}

function updateNotifyButton() {
    var btn = document.getElementById('cp-notify-toggle');
    if (!btn) return;
    if (!notifySupported()) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    var on = notifyAllowed();
    var cls = 'cp-sound' + (on ? ' is-on' : '');
    if (btn.className !== cls) btn.className = cls;
    btn.setAttribute('title', tr(on ? 'LBL_NOTIFY_ON_TITLE' : 'LBL_NOTIFY_OFF_TITLE', '')
        .replace('%s', WAIT_ALERT_SEC));
}

function showWaitNotification(queue, caller, key) {
    if (!notifyAllowed()) return;
    if (!document.hidden && document.hasFocus && document.hasFocus()) return;   // the page is in view
    try {
        var since = callerSince(caller);
        var n = new Notification(
            tr('LBL_NOTIFY_TITLE', 'Caller waiting %s').replace('%s', formatDuration((serverNow() - since * 1000) / 1000)),
            {
                body: tr('LBL_NOTIFY_BODY', 'Queue %s').replace('%s', queue.get('extension')) +
                    ' · ' + (Ember.get(caller, 'CallerIDNum') || ''),
                tag: 'cp-wait-' + key
            });
        n.onclick = function() { window.focus(); this.close(); };
        setTimeout(function() { n.close(); }, 15000);
    } catch (e) {}
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Asterisk device state of a queue member -> CSS class + translated label.
// 0 unknown, 1 not in use, 2 in use, 3 busy, 4 invalid, 5 unavailable,
// 6 ringing, 7 ringing while in use, 8 on hold.
function memberStatus(status, paused) {
    status = String(status);
    paused = paused == null ? "0" : String(paused);
    if (paused !== "0" && status !== "5") {
        return {cls: 'st-paused', label: tr('LBL_PAUSED', 'Paused')};
    }
    switch (status) {
        case '1': return {cls: 'st-free',     label: tr('LBL_AVAILABLE', 'Available')};
        case '2': return {cls: 'st-busy',     label: tr('LBL_IN_USE', 'In use')};
        case '3': return {cls: 'st-busy',     label: tr('LBL_BUSY', 'Busy')};
        case '4': return {cls: 'st-error',    label: tr('LBL_INVALID', 'Invalid')};
        case '5': return {cls: 'st-offline',  label: tr('LBL_UNAVAILABLE', 'Unavailable')};
        case '6': return {cls: 'st-ringing',  label: tr('LBL_RINGING', 'Ringing')};
        case '7': return {cls: 'st-ringing',  label: tr('LBL_RING_IN_USE', 'Ringing, in use')};
        case '8': return {cls: 'st-busy',     label: tr('LBL_ON_HOLD', 'On Hold')};
        default:  return {cls: 'st-offline',  label: '?'};
    }
}


// Called from the reset icon of a queue card with the icon element
// (older templates passed the "QUEUE/<number>" string directly).
function refreshQueueParameters(queue) {
    if (queue && queue.nodeType === 1) {
        var card = $(queue).closest('[data-idattr]');
        queue = card.length ? card.attr('data-idattr') : '';
    }
    var cadena = String(queue || '');
    var expresionRegular = /\/(.+)/;
    var coincidencias = cadena.match(expresionRegular);
    var cleanQueue = coincidencias ? coincidencias[1] : null;
    if (!cleanQueue) return;

    // Authenticated module action; the next snapshot shows the reset counters.
    $.post('index.php?menu=' + module_name + '&rawmode=yes', {
        action: 'resetQueueStats',
        queue: cleanQueue
    }, function(respuesta) {
        verificar_error_session(respuesta);
        if (respuesta && respuesta.status == 'error') alert(respuesta.message);
    }, 'json').fail(function() {
        alert(tr('LBL_RESET_FAILED', 'Failed to reset queue statistics'));
    });
}


// Extension online/offline counters are computed in
// App.DesktopController.manejarRespuestaSnapshot and bound in panel.tpl.

//////////////////////////////// CALL LISTENING (ChanSpy) ////////////////////////////////
//
// The headphones button of an agent row opens a dialog: the supervisor enters
// the number Asterisk should call (own extension or an external number) and
// the mode. Numbers are remembered in localStorage for quick selection and can
// be removed. While a session is active a bar at the bottom shows its state,
// switches the mode and hangs up (e.g. when a wrong number was called).
// Server side: index.php handleJSON_spyStart / spyStatus / spyMode / spyStop.

var SPY_RECENT_KEY = 'cp-spy-recent';
var SPY_RECENT_MAX = 8;
var SPY_POLL_MS = 2000;
var SPY_MODES = ['listen', 'whisper', 'barge'];
var spySession = null;      // {uid, agent, name, target, mode, started, answered, confirming, ended, timer}
var spyDialogAgent = null;  // {number, name} while the dialog is open
var spyDialogMode = 'listen';

function spyUrl() {
    return 'index.php?menu=' + module_name + '&rawmode=yes';
}

function spyRequest(method, data, done, fail) {
    $.ajax({url: spyUrl(), type: method, data: data, dataType: 'json', timeout: 10000})
        .done(function(r) {
            if (r) verificar_error_session(r);
            done(r || {status: 'error', message: ''});
        })
        .fail(function() { if (fail) fail(); });
}

function spyModeLabel(mode) {
    return tr({listen: 'LBL_SPY_MODE_LISTEN', whisper: 'LBL_SPY_MODE_WHISPER', barge: 'LBL_SPY_MODE_BARGE'}[mode],
        {listen: 'Listen', whisper: 'Whisper', barge: 'Barge in'}[mode]);
}

function spyModeTitle(mode) {
    return tr({listen: 'LBL_SPY_MODE_LISTEN_TITLE', whisper: 'LBL_SPY_MODE_WHISPER_TITLE', barge: 'LBL_SPY_MODE_BARGE_TITLE'}[mode], '');
}

function spyModeButtons(onclickFn) {
    return SPY_MODES.map(function(mode) {
        return '<button type="button" class="cp-spy-mode" data-mode="' + mode + '" title="' +
            escapeHtml(spyModeTitle(mode)) + '" onclick="' + onclickFn + '(\'' + mode + '\')">' +
            escapeHtml(spyModeLabel(mode)) + '</button>';
    }).join('');
}

function markSpyMode(container, mode) {
    $(container).find('.cp-spy-mode').each(function() {
        $(this).toggleClass('is-on', this.getAttribute('data-mode') === mode);
    });
}

// Recent numbers ------------------------------------------------------------

function spyRecentLoad() {
    try {
        var list = JSON.parse(window.localStorage.getItem(SPY_RECENT_KEY) || '[]');
        return $.isArray(list) ? list.filter(function(n) { return typeof n === 'string'; }) : [];
    } catch (e) { return []; }
}

function spyRecentSave(list) {
    try { window.localStorage.setItem(SPY_RECENT_KEY, JSON.stringify(list.slice(0, SPY_RECENT_MAX))); } catch (e) {}
}

function spyRecentAdd(number) {
    spyRecentSave([number].concat(spyRecentLoad().filter(function(n) { return n !== number; })));
}

function spyRecentRemove(number) {
    spyRecentSave(spyRecentLoad().filter(function(n) { return n !== number; }));
    renderSpyRecent();
}

function renderSpyRecent() {
    var box = document.getElementById('cp-spy-recent');
    if (!box) return;
    var list = spyRecentLoad();
    box.innerHTML = list.length ? list.map(function(n) {
        var v = escapeHtml(n);
        return '<span class="cp-spy-chip" data-number="' + v + '">' +
            '<span class="cp-spy-chip-num">' + v + '</span>' +
            '<i class="fa fa-times" title="' + escapeHtml(tr('LBL_SPY_REMOVE', 'Remove')) + '"></i></span>';
    }).join('') : '<span class="cp-spy-empty">' + escapeHtml(tr('LBL_SPY_NO_RECENT', '')) + '</span>';
}

// Dialog -------------------------------------------------------------------

function spyNormalizeNumber(value) {
    return String(value || '').replace(/[\s\-().]/g, '');
}

function spyValidNumber(number) {
    return /^\+?[0-9*#]{2,20}$/.test(number);
}

function ensureSpyDialog() {
    if (document.getElementById('cp-spy-overlay')) return;
    var html =
        '<div id="cp-spy-overlay" class="cp-spy-overlay" style="display:none">' +
        '<div class="cp-spy-dialog" role="dialog">' +
            '<div class="cp-spy-head"><i class="fa fa-headphones"></i> <span id="cp-spy-title"></span>' +
                '<span class="cp-spy-x" onclick="closeSpyDialog()">&times;</span></div>' +
            '<label class="cp-spy-label" for="cp-spy-input">' + escapeHtml(tr('LBL_SPY_TARGET', 'Call me at')) + '</label>' +
            '<input id="cp-spy-input" class="cp-spy-input" type="tel" maxlength="24" autocomplete="off" placeholder="' +
                escapeHtml(tr('LBL_SPY_TARGET_PH', '')) + '">' +
            '<div class="cp-spy-label">' + escapeHtml(tr('LBL_SPY_RECENT', 'Recent numbers')) + '</div>' +
            '<div id="cp-spy-recent" class="cp-spy-recent"></div>' +
            '<div class="cp-spy-modes" id="cp-spy-dialog-modes">' + spyModeButtons('setSpyDialogMode') + '</div>' +
            '<div class="cp-spy-hint">' + escapeHtml(tr('LBL_SPY_KEYS_HINT', '')) + '</div>' +
            '<div class="cp-spy-hint">' + escapeHtml(tr('LBL_SPY_CONFIRM_HINT', '')) + '</div>' +
            '<div id="cp-spy-error" class="cp-spy-error"></div>' +
            '<div class="cp-spy-actions">' +
                '<button type="button" class="cp-spy-btn" onclick="closeSpyDialog()">' + escapeHtml(tr('LBL_CANCEL', 'Cancel')) + '</button>' +
                '<button type="button" id="cp-spy-call" class="cp-spy-btn cp-spy-btn-primary" onclick="submitSpyDialog()">' +
                    '<i class="fa fa-phone"></i> ' + escapeHtml(tr('LBL_SPY_CALL', 'Call me')) + '</button>' +
            '</div>' +
        '</div></div>';
    $('body').append(html);

    $('#cp-spy-overlay').on('mousedown', function(e) { if (e.target === this) closeSpyDialog(); });
    $('#cp-spy-input').on('keydown', function(e) {
        if (e.keyCode === 13) { e.preventDefault(); submitSpyDialog(); }
        if (e.keyCode === 27) closeSpyDialog();
    });
    // Chip: click selects the number, the cross removes it from the list
    $('#cp-spy-recent').on('click', '.cp-spy-chip', function(e) {
        var number = this.getAttribute('data-number');
        if ($(e.target).hasClass('fa-times')) { spyRecentRemove(number); return; }
        $('#cp-spy-input').val(number).focus();
        $('#cp-spy-error').text('');
    });
}

function openSpyDialog(el) {
    var row = $(el).closest('.agent-container');
    var number = row.attr('data-member-number');
    if (!number) return;
    ensureSpyDialog();
    spyDialogAgent = {number: number, name: $.trim(row.find('.agent-name').text())};
    spyDialogMode = 'listen';
    $('#cp-spy-title').text(tr('LBL_SPY_TITLE', 'Listen to agent %s').replace('%s', number) +
        (spyDialogAgent.name ? ' · ' + spyDialogAgent.name : ''));
    $('#cp-spy-input').val('');     // the number is chosen every time
    $('#cp-spy-error').text('');
    $('#cp-spy-call').prop('disabled', false);
    markSpyMode('#cp-spy-dialog-modes', spyDialogMode);
    renderSpyRecent();
    $('#cp-spy-overlay').show();
    $('#cp-spy-input').focus();
}

function closeSpyDialog() {
    $('#cp-spy-overlay').hide();
    spyDialogAgent = null;
}

function setSpyDialogMode(mode) {
    spyDialogMode = mode;
    markSpyMode('#cp-spy-dialog-modes', mode);
}

function submitSpyDialog() {
    if (!spyDialogAgent) return;
    var target = spyNormalizeNumber($('#cp-spy-input').val());
    if (!spyValidNumber(target)) {
        $('#cp-spy-error').text(tr('LBL_SPY_BAD_NUMBER', 'Invalid number'));
        $('#cp-spy-input').focus();
        return;
    }
    var agent = spyDialogAgent;
    // The call may have ended while the dialog was open (the button is gone)
    if (!$('.agent-container[data-member-number="' + agent.number + '"] .agent-spy').length) {
        $('#cp-spy-error').text(tr('LBL_SPY_NOT_IN_CALL', 'The agent is not in a call anymore'));
        return;
    }
    $('#cp-spy-call').prop('disabled', true);
    startSpy(agent.number, agent.name, target, spyDialogMode, function(ok, message) {
        $('#cp-spy-call').prop('disabled', false);
        if (ok) closeSpyDialog();
        else $('#cp-spy-error').text(message || tr('LBL_SPY_FAILED', 'Failed to start listening'));
    });
}

// Session ------------------------------------------------------------------

function startSpy(agent, name, target, mode, callback) {
    var begin = function() {
        spyRequest('POST', {action: 'spyStart', agent: agent, target: target, mode: mode}, function(r) {
            if (r.status !== 'success' || !r.uid) { callback(false, r.message); return; }
            spyRecentAdd(target);
            spySession = {uid: r.uid, agent: agent, name: name, target: target, mode: mode,
                started: Date.now(), answered: false, confirming: false, ended: false, timer: null};
            renderSpyBar();
            spySession.timer = setInterval(pollSpy, SPY_POLL_MS);
            callback(true);
        }, function() { callback(false, ''); });
    };
    // One session at a time: hang up the previous one first
    if (spySession && !spySession.ended) stopSpy(begin); else begin();
}

function pollSpy() {
    var s = spySession;
    if (!s || s.ended) return;
    spyRequest('GET', {action: 'spyStatus', uid: s.uid}, function(r) {
        if (spySession !== s || r.status !== 'success') return;
        if (r.active) {
            s.answered = !!r.answered;
            s.confirming = !!r.confirming;   // external number: waits for 1
            renderSpyBar();
        } else if (Date.now() - s.started > 4000) {
            endSpySession(s);    // not answered, rejected or finished
        }
    });
}

function endSpySession(s) {
    if (s.timer) clearInterval(s.timer);
    s.ended = true;
    renderSpyBar();
    setTimeout(function() {
        if (spySession === s) { spySession = null; renderSpyBar(); }
    }, 3000);
}

// Hang up the current session ("wrong number" or finished listening)
function stopSpy(then) {
    var s = spySession;
    if (!s) { if (then) then(); return; }
    var finish = function() { endSpySession(s); if (then) then(); };
    spyRequest('POST', {action: 'spyStop', uid: s.uid}, function(r) {
        if (r.status !== 'success' && r.message) alert(r.message);
        finish();
    }, finish);
}

// Mode buttons of the bar: "press" 4/5/6 on the call; older Asterisk cannot,
// then the supervisor is called again in the new mode.
function setSpyMode(mode) {
    var s = spySession;
    if (!s || s.ended || !s.answered || s.confirming || s.mode === mode) return;
    spyRequest('POST', {action: 'spyMode', uid: s.uid, mode: mode}, function(r) {
        if (spySession !== s) return;
        if (r.status !== 'success') { if (r.message) alert(r.message); return; }
        if (r.unsupported) {
            if (!confirm(tr('LBL_SPY_RECONNECT', 'Call you again in the new mode?'))) return;
            startSpy(s.agent, s.name, s.target, mode, function(ok, message) {
                if (!ok) alert(message || tr('LBL_SPY_FAILED', 'Failed to start listening'));
            });
            return;
        }
        s.mode = mode;
        renderSpyBar();
    });
}

function renderSpyBar() {
    var bar = document.getElementById('cp-spy-bar');
    var s = spySession;
    if (!s) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) {
        $('body').append(
            '<div id="cp-spy-bar" class="cp-spy-bar">' +
                '<i class="fa fa-headphones cp-spy-bar-icon"></i>' +
                '<div class="cp-spy-bar-text"><div class="cp-spy-bar-title"></div><div class="cp-spy-bar-state"></div></div>' +
                '<div class="cp-spy-modes" id="cp-spy-bar-modes">' + spyModeButtons('setSpyMode') + '</div>' +
                '<button type="button" class="cp-spy-btn cp-spy-btn-stop" onclick="stopSpy()">' +
                    '<i class="fa fa-phone"></i> ' + escapeHtml(tr('LBL_SPY_STOP', 'Hang up')) + '</button>' +
            '</div>');
        bar = document.getElementById('cp-spy-bar');
    }
    bar.style.display = '';
    var live = s.answered && !s.confirming && !s.ended;
    $(bar).toggleClass('is-live', live).toggleClass('is-confirm', s.confirming && !s.ended)
        .toggleClass('is-ended', s.ended);
    $(bar).find('.cp-spy-bar-title').text(tr('LBL_SPY_BAR', 'Listening to %s').replace('%s', s.agent) +
        (s.name ? ' · ' + s.name : ''));
    $(bar).find('.cp-spy-bar-state').text(
        s.ended ? tr('LBL_SPY_ENDED', 'Ended') :
        s.confirming ? tr('LBL_SPY_CONFIRM', 'Answer and press 1') :
        s.answered ? tr('LBL_SPY_CONNECTED', 'Connected') + ' · ' + s.target :
        tr('LBL_SPY_CALLING', 'Calling %s…').replace('%s', s.target));
    markSpyMode(bar, s.mode);
    // Mode keys work only while ChanSpy runs (not ringing, not waiting for 1)
    $(bar).find('.cp-spy-mode').prop('disabled', !live);
    $(bar).find('.cp-spy-btn-stop').prop('disabled', s.ended);
}

// Language switcher of the status bar: remembered per browser in a cookie
// read by index.php (_applyModuleLanguage), then the page is reloaded.
function setModuleLanguage(code) {
    if (!/^[a-z]{2}$/.test(code)) return;
    document.cookie = 'cp_lang=' + code + '; path=/; max-age=31536000; SameSite=Lax';
    location.reload();
}
